#!/usr/bin/env python3
# encoding: utf-8
"""
Preprocessing pipeline (per-folder JSON) - corrected version

Features:
- Supports DOCX, PDF (pdfplumber primary, OCR fallback), TXT, MD
- Writes per-folder JSON: preprocessed_output/<safe_folder>.json
- SQLite manifest: files table + chunks table for process-safe dedupe & status
- Deterministic chunk_id (sha256 of chunk text)
- Accurate page_start/page_end mapping for PDFs and multi-page docs
- CLI: --scan-only, --process, --embed
- Embedding placeholder: implement your embedding provider in `run_embedding_upsert`

Run:
  python preprocessing_pipeline.py --scan-only
  python preprocessing_pipeline.py --process --workers 4
  python preprocessing_pipeline.py --embed

Note: optional dependencies: python-docx, pdfplumber, pdf2image + poppler, pytesseract, tiktoken
"""

import os
import re
import json
import time
import uuid
import hashlib
import logging
import argparse
import sqlite3
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from concurrent.futures import ProcessPoolExecutor, as_completed

# Optional imports
try:
    import docx
except Exception:
    docx = None

try:
    import pdfplumber
except Exception:
    pdfplumber = None

try:
    from PIL import Image
except Exception:
    Image = None

try:
    import pytesseract
except Exception:
    pytesseract = None

try:
    import tiktoken
except Exception:
    tiktoken = None

# ---------------- CONFIG ----------------
ROOT_FOLDERS = [
    "./documents/Board and Committee Proceedings",
    "./documents/By-Laws & Governance Policies",
    "./documents/External Advocacy &  Communications",
    "./documents/Policy & Position Statements",
    "./documents/Resolutions"
]

OUTPUT_DIR = Path("./preprocessed_output")
MANIFEST_DB = OUTPUT_DIR / "manifest.db"
CHUNK_TOKENS = 800
CHUNK_OVERLAP = 200
EMBED_BATCH_SIZE = 128
MAX_WORKERS = 4
OCR_DPI = 300

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("preproc")

# ---------------- Utilities ----------------
def ensure_output_dir():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

# ---------------- Manifest (SQLite) ----------------
def init_manifest(db_path: Path):
    ensure_output_dir()
    conn = sqlite3.connect(str(db_path), timeout=30, isolation_level=None)
    c = conn.cursor()
    # files table tracks files to process
    c.execute("""
        CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            path TEXT UNIQUE,
            folder TEXT,
            filename TEXT,
            size INTEGER,
            mtime REAL,
            status TEXT,
            text_hash TEXT,
            error TEXT,
            created_at REAL,
            updated_at REAL
        )
    """)
    # chunks table tracks individual chunk hashes and their processing status
    c.execute("""
        CREATE TABLE IF NOT EXISTS chunks (
            text_hash TEXT PRIMARY KEY,
            chunk_id TEXT,
            doc_id TEXT,
            status TEXT,
            created_at REAL,
            updated_at REAL
        )
    """)
    conn.commit()
    conn.close()

def add_to_manifest(db_path: Path, file_path: Path, folder: str):
    conn = sqlite3.connect(str(db_path), timeout=30)
    c = conn.cursor()
    stat = file_path.stat()
    now = time.time()
    fid = str(uuid.uuid4())
    c.execute("INSERT OR IGNORE INTO files (id, path, folder, filename, size, mtime, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
              (fid, str(file_path), folder, file_path.name, stat.st_size, stat.st_mtime, "pending", now, now))
    conn.commit()
    conn.close()

def list_pending(db_path: Path, limit: int = 10000) -> List[Tuple[str, str]]:
    conn = sqlite3.connect(str(db_path))
    c = conn.cursor()
    c.execute("SELECT path, folder FROM files WHERE status = ? LIMIT ?", ("pending", limit))
    rows = c.fetchall()
    conn.close()
    return rows

def update_manifest(db_path: Path, path: str, status: str, text_hash: Optional[str]=None, error: Optional[str]=None):
    conn = sqlite3.connect(str(db_path))
    c = conn.cursor()
    now = time.time()
    c.execute("UPDATE files SET status = ?, text_hash = ?, error = ?, updated_at = ? WHERE path = ?",
              (status, text_hash, error, now, path))
    conn.commit()
    conn.close()

# chunk table helpers
def try_reserve_chunk(db_path: Path, text_hash: str, chunk_id: str, doc_id: str) -> bool:
    """
    Attempt to reserve a chunk by inserting into chunks table.
    Returns True if we successfully inserted (we own this chunk).
    If the text_hash already exists, return False (duplicate).
    """
    conn = sqlite3.connect(str(db_path), timeout=30)
    c = conn.cursor()
    now = time.time()
    try:
        c.execute("INSERT INTO chunks (text_hash, chunk_id, doc_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                  (text_hash, chunk_id, doc_id, "pending", now, now))
        conn.commit()
        conn.close()
        return True
    except sqlite3.IntegrityError:
        # Already exists - someone else inserted
        conn.close()
        return False

def update_chunk_status(db_path: Path, text_hash: str, status: str):
    conn = sqlite3.connect(str(db_path), timeout=30)
    c = conn.cursor()
    now = time.time()
    c.execute("UPDATE chunks SET status = ?, updated_at = ? WHERE text_hash = ?", (status, now, text_hash))
    conn.commit()
    conn.close()

# ---------------- Extraction ----------------
def extract_text_docx(path: Path) -> Tuple[str, List[Dict]]:
    if docx is None:
        raise ImportError("python-docx is required. Install with: pip install python-docx")
    document = docx.Document(str(path))
    parts = []
    char_pos = 0
    for para in document.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        parts.append({"text": text, "start_char": char_pos, "end_char": char_pos + len(text)})
        char_pos += len(text) + 1
    full_text = "\n\n".join([p["text"] for p in parts])
    # group into page-like parts as single-item pages for mapping
    page_parts = [{"text": p["text"], "page": i+1} for i,p in enumerate(parts)]
    return full_text, page_parts

def extract_text_pdf(path: Path) -> Tuple[str, List[Dict]]:
    parts = []
    full = []
    if pdfplumber is not None:
        try:
            with pdfplumber.open(str(path)) as pdf:
                for i, p in enumerate(pdf.pages):
                    text = p.extract_text() or ""
                    text = text.replace("\r\n", "\n").strip()
                    parts.append({"text": text, "page": i+1})
                    full.append(text)
            return "\n\n".join(full), parts
        except Exception as e:
            logger.warning("pdfplumber extraction failed for %s: %s", path, e)
    # OCR fallback
    if pytesseract is not None and Image is not None:
        logger.info("PDF extraction falling back to OCR for %s", path)
        images = pdf_to_images(path)
        for i, img in enumerate(images):
            text = pytesseract.image_to_string(img)
            text = text.replace("\r\n", "\n").strip()
            parts.append({"text": text, "page": i+1})
        return "\n\n".join([p["text"] for p in parts]), parts
    logger.error("No PDF extractor available for %s. Install pdfplumber or enable OCR.", path)
    return "", []

def pdf_to_images(path: Path, dpi: int = OCR_DPI) -> List[Image.Image]:
    try:
        from pdf2image import convert_from_path
        images = convert_from_path(str(path), dpi=dpi)
        return images
    except Exception as e:
        logger.error("Error converting PDF to images (pdf2image/poppler may be required): %s", e)
        return []

def extract_text_txt_md(path: Path) -> Tuple[str, List[Dict]]:
    txt = path.read_text(encoding="utf-8", errors="ignore")
    parts = []
    if path.suffix.lower() == ".md":
        segs = re.split(r"\n(?=#)", txt)
    else:
        segs = [s for s in txt.split("\n\n") if s.strip()]
    char = 0
    for i,s in enumerate(segs):
        s = s.strip()
        if not s:
            continue
        parts.append({"text": s, "page": i+1})
        char += len(s) + 2
    return "\n\n".join([p["text"] for p in parts]), parts

# ---------------- Cleaning ----------------
HEADER_FOOTER_SAMPLE_LINES = 3

def remove_repeated_headers_footers(page_texts: List[str]) -> List[str]:
    if not page_texts:
        return page_texts
    from collections import Counter
    candidates = Counter()
    page_lines = []
    for txt in page_texts:
        lines = [l.strip() for l in txt.splitlines() if l.strip()]
        page_lines.append(lines)
        first = lines[:HEADER_FOOTER_SAMPLE_LINES]
        last = lines[-HEADER_FOOTER_SAMPLE_LINES:]
        for l in first + last:
            if len(l) < 200:
                candidates[l] += 1
    threshold = max(2, len(page_texts) // 3)
    repeated = {line for line, cnt in candidates.items() if cnt >= threshold}
    cleaned = []
    for lines in page_lines:
        cleaned.append("\n".join([l for l in lines if l not in repeated]))
    return cleaned

def normalize_text_whitespace(text: str) -> str:
    text = re.sub(r"\r\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    return text.strip()

# ---------------- Token counting & chunking ----------------
def token_count(text: str, model: str = "gpt-4o-mini") -> int:
    if tiktoken is not None:
        try:
            enc = tiktoken.encoding_for_model(model)
        except Exception:
            enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    else:
        words = text.split()
        return int(len(words) / 0.75) + 1

def intelligent_chunking_with_char_positions(text: str, target_tokens: int = CHUNK_TOKENS, overlap_tokens: int = CHUNK_OVERLAP) -> List[Dict]:
    """
    Chunk by paragraphs and sentences while tracking char_start/char_end accurately.
    Returns list of dicts: {"text", "n_tokens", "char_start", "char_end"}
    """
    if not text:
        return []
    # token encoder if available
    enc = None
    if tiktoken is not None:
        try:
            enc = tiktoken.encoding_for_model("gpt-4")
        except Exception:
            enc = tiktoken.get_encoding("cl100k_base")

    def count_tokens_local(s: str) -> int:
        if enc:
            return len(enc.encode(s))
        else:
            return int(len(s.split()) / 0.75) + 1

    paragraphs = [p for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks = []
    char_pointer = 0  # track position in original text
    current_chunk = ""
    current_start = None
    current_tokens = 0

    # We will iterate through paragraphs, preserving their original positions
    cursor = 0
    for para in paragraphs:
        # find this paragraph in text starting from cursor
        idx = text.find(para, cursor)
        if idx == -1:
            # fallback: try from start
            idx = text.find(para)
        if idx == -1:
            # cannot find, skip this paragraph
            cursor += len(para)
            continue
        para_start = idx
        para_end = idx + len(para)
        cursor = para_end

        para_tokens = count_tokens_local(para)

        # if paragraph alone is huge, break it into sentences
        if para_tokens > target_tokens:
            sentences = re.split(r'(?<=[.!?])\s+', para)
            for sentence in sentences:
                if not sentence.strip():
                    continue
                sent_idx = text.find(sentence, para_start, para_end)
                if sent_idx == -1:
                    sent_idx = para_start
                sent_start = sent_idx
                sent_end = sent_start + len(sentence)
                sent_tokens = count_tokens_local(sentence)
                if current_chunk and (current_tokens + sent_tokens > target_tokens):
                    # flush current chunk
                    chunks.append({
                        "text": current_chunk,
                        "n_tokens": current_tokens,
                        "char_start": current_start,
                        "char_end": current_start + len(current_chunk)
                    })
                    # start new chunk with overlap words
                    overlap_words = current_chunk.split()[-overlap_tokens:] if overlap_tokens > 0 else []
                    overlap_text = " ".join(overlap_words)
                    current_chunk = (overlap_text + " " + sentence).strip() if overlap_text else sentence.strip()
                    current_start = sent_start if not overlap_text else sent_start - len(overlap_text) - 1
                    current_tokens = count_tokens_local(current_chunk)
                else:
                    if not current_chunk:
                        current_start = sent_start
                        current_chunk = sentence.strip()
                        current_tokens = sent_tokens
                    else:
                        current_chunk += (" " + sentence.strip())
                        current_tokens += sent_tokens
        else:
            # normal paragraph handling
            if current_chunk and (current_tokens + para_tokens > target_tokens):
                # flush current chunk
                chunks.append({
                    "text": current_chunk,
                    "n_tokens": current_tokens,
                    "char_start": current_start,
                    "char_end": current_start + len(current_chunk)
                })
                # start new chunk with overlap
                overlap_words = current_chunk.split()[-overlap_tokens:] if overlap_tokens > 0 else []
                overlap_text = " ".join(overlap_words)
                current_chunk = (overlap_text + "\n\n" + para).strip() if overlap_text else para.strip()
                # new start is para_start minus overlap char length (best-effort)
                current_start = para_start - (len(overlap_text) + 2) if overlap_text else para_start
                if current_start < 0:
                    current_start = 0
                current_tokens = count_tokens_local(current_chunk)
            else:
                if not current_chunk:
                    current_start = para_start
                    current_chunk = para
                    current_tokens = para_tokens
                else:
                    current_chunk += ("\n\n" + para)
                    current_tokens += para_tokens

    if current_chunk:
        chunks.append({
            "text": current_chunk,
            "n_tokens": current_tokens,
            "char_start": current_start if current_start is not None else 0,
            "char_end": (current_start if current_start is not None else 0) + len(current_chunk)
        })

    # sanitize and ensure char_end consistent
    for ch in chunks:
        if ch["char_start"] is None:
            ch["char_start"] = 0
        if "char_end" not in ch or ch["char_end"] <= ch["char_start"]:
            ch["char_end"] = ch["char_start"] + len(ch["text"])

    return chunks

# ---------------- Per-folder JSON writer ----------------
def append_chunk_json_per_folder(base_out_dir: Path, chunk_record: Dict):
    folder = chunk_record.get("folder", "unknown")
    safe_folder = re.sub(r"[^0-9A-Za-z._-]", "_", folder)
    out_path = base_out_dir / f"{safe_folder}.json"
    
    # Read existing data or create new list
    chunks = []
    if out_path.exists():
        try:
            with open(out_path, "r", encoding="utf-8") as f:
                chunks = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            chunks = []
    
    # Add new chunk
    chunks.append(chunk_record)
    
    # Write back to file
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(chunks, f, ensure_ascii=False, indent=2)

# ---------------- Metadata / helpers ----------------
def extract_document_date(doc_title: str, text: str = "") -> Optional[str]:
    date_patterns = [
        r'(\d{1,2}[-/]\d{1,2}[-/]\d{4})',  # MM-DD-YYYY
        r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})',  # YYYY-MM-DD
        r'([A-Za-z]+\s+\d{1,2},?\s+\d{4})', # Month DD, YYYY
        r'(\d{4})',                         # year fallback
    ]
    for pattern in date_patterns:
        match = re.search(pattern, doc_title)
        if match:
            return match.group(1)
    if text:
        sample = text[:1000]
        for pattern in date_patterns[:2]:
            match = re.search(pattern, sample)
            if match:
                return match.group(1)
    return None

def create_structured_metadata(file_path: Path, folder: str, text: str = "") -> Dict:
    stat = file_path.stat()
    folder_mappings = {
        'board and committee proceedings': 'Board_and_Committee_Proceedings',
        'by-laws & governance policies': 'By-Laws_and_Governance_Policies',
        'bylaws & governance policies': 'By-Laws_and_Governance_Policies',
        'external advocacy & communications': 'External_Advocacy_and_Communications',
        'policy & position statements': 'Policy_and_Position_Statements',
        'resolutions': 'Resolutions'
    }
    normalized_folder = folder_mappings.get(folder.lower(), folder)
    # Clean up category name - convert underscores to proper names
    category_names = {
        'Board_and_Committee_Proceedings': 'Board & Committee Proceedings',
        'By-Laws_and_Governance_Policies': 'By-Laws & Governance Policies', 
        'External_Advocacy_and_Communications': 'External Advocacy & Communications',
        'Policy_and_Position_Statements': 'Policy & Position Statements',
        'Resolutions': 'Resolutions'
    }
    
    metadata = {
        "doc_id": str(uuid.uuid4()),
        "doc_title": file_path.name,
        "category": category_names.get(normalized_folder, normalized_folder),
        "folder": normalized_folder,
        "source_path": str(file_path).replace('\\', '/'),  # Cross-platform paths
        "file_size": stat.st_size,
        "created_at": stat.st_ctime,
        "modified_at": stat.st_mtime,
        "version": "v1",
        "encoding": "utf-8"
    }
    doc_date = extract_document_date(file_path.name, text)
    if doc_date:
        metadata["date"] = doc_date
    return metadata

# ---------------- Quality checks ----------------
def validate_chunk_quality(chunk: Dict) -> Tuple[bool, List[str]]:
    issues = []
    required_fields = ['chunk_id', 'doc_id', 'doc_title', 'folder', 'text', 'n_tokens', 'text_hash', 'version']
    for field in required_fields:
        if field not in chunk or chunk[field] is None:
            issues.append(f"Missing required field: {field}")
    if 'text' in chunk:
        text = chunk['text']
        if not text or not text.strip():
            issues.append("Empty or whitespace-only text")
        elif len(text) < 50:
            issues.append("Text too short (< 50 characters)")
    if 'n_tokens' in chunk:
        n_tokens = chunk['n_tokens']
        if not isinstance(n_tokens, int) or n_tokens < 1:
            issues.append("Invalid token count")
        elif n_tokens < 50:
            issues.append("Token count too low (< 50)")
        elif n_tokens > 5000:
            issues.append("Token count too high (> 5000)")
    if 'char_start' in chunk and 'char_end' in chunk:
        start, end = chunk['char_start'], chunk['char_end']
        if not isinstance(start, int) or not isinstance(end, int):
            issues.append("Invalid character range types")
        elif start < 0 or end < 0:
            issues.append("Negative character positions")
        elif start >= end:
            issues.append("Invalid character range (start >= end)")
    return len(issues) == 0, issues

def detect_near_duplicates(chunk_text: str, existing_texts: Dict[str, str], threshold: float = 0.9) -> Tuple[bool, str, float]:
    def jaccard_similarity(text1: str, text2: str) -> float:
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        if not words1 and not words2:
            return 1.0
        if not words1 or not words2:
            return 0.0
        intersection = len(words1.intersection(words2))
        union = len(words1.union(words2))
        return intersection / union if union > 0 else 0.0

    max_similarity = 0.0
    most_similar_hash = None
    sample_text = chunk_text[:1000]
    for existing_hash, existing_text in existing_texts.items():
        existing_sample = existing_text[:1000]
        similarity = jaccard_similarity(sample_text, existing_sample)
        if similarity > max_similarity:
            max_similarity = similarity
            most_similar_hash = existing_hash
    is_near_duplicate = max_similarity > threshold
    return is_near_duplicate, most_similar_hash or "", max_similarity

# ---------------- Process single file ----------------
def process_single_file(file_path: str) -> Tuple[str, Optional[str]]:
    """
    Process a single file: extract, clean, chunk, dedupe (SQLite chunks table), and write per-folder JSONL.
    Returns (path, error_or_None)
    """
    path = Path(file_path)
    folder = path.parent.name
    try:
        logger.info("Processing: %s", path)
        # 1) Extract text
        if path.suffix.lower() == ".docx":
            full_text, page_parts = extract_text_docx(path)
            page_texts = [p["text"] for p in page_parts]
        elif path.suffix.lower() == ".pdf":
            full_text, page_parts = extract_text_pdf(path)
            page_texts = [p.get("text", "") for p in page_parts]
        elif path.suffix.lower() in (".txt", ".md"):
            full_text, page_parts = extract_text_txt_md(path)
            page_texts = [p["text"] for p in page_parts]
        else:
            update_manifest(MANIFEST_DB, str(path), "skipped", None, "unsupported file type")
            return str(path), "unsupported"

        if not full_text or not full_text.strip():
            update_manifest(MANIFEST_DB, str(path), "empty", None, "no text extracted")
            return str(path), "empty"

        # 2) Clean pages
        if len(page_texts) > 1:
            cleaned_pages = remove_repeated_headers_footers(page_texts)
        else:
            cleaned_pages = page_texts
        cleaned_pages = [advanced_text_cleaning(normalize_text_whitespace(p)) for p in cleaned_pages]
        full_clean = "\n\n".join([p for p in cleaned_pages if p]).strip()
        full_clean = full_clean.encode('utf-8', errors='ignore').decode('utf-8')

        if not full_clean.strip():
            update_manifest(MANIFEST_DB, str(path), "empty", None, "no meaningful text after cleaning")
            return str(path), "empty"

        # 3) Metadata
        document_metadata = create_structured_metadata(path, folder, full_clean)
        doc_id = document_metadata["doc_id"]

        # 4) Document-level duplicate detection (by full text hash) - DISABLED FOR NOW
        doc_hash = sha256_text(full_clean)
        # Skip duplicate detection to allow processing of all files
        # conn = sqlite3.connect(str(MANIFEST_DB))
        # c = conn.cursor()
        # c.execute("SELECT path FROM files WHERE text_hash = ?", (doc_hash,))
        # dup = c.fetchone()
        # conn.close()
        # if dup:
        #     logger.info("Duplicate document found, skipping %s (duplicate of %s)", path, dup[0])
        #     update_manifest(MANIFEST_DB, str(path), "duplicate", doc_hash, None)
        #     return str(path), "duplicate"

        # 5) Chunking
        chunks = intelligent_chunking_with_char_positions(full_clean, target_tokens=CHUNK_TOKENS, overlap_tokens=CHUNK_OVERLAP)
        if not chunks:
            update_manifest(MANIFEST_DB, str(path), "empty", None, "no chunks created")
            return str(path), "empty"

        created_chunks = 0
        review_queue = []

        # For near-duplicate detection within this file we will keep simple in-memory dict of text_hash -> text
        local_text_map = {}

        # Build page char offsets to map char positions to pages
        page_offsets = []
        cum = 0
        for p in cleaned_pages:
            page_offsets.append((cum, cum + len(p)))
            cum += len(p) + 2  # account for the "\n\n" join
        # process chunks
        for ch in chunks:
            chunk_text = ch["text"]
            n_tokens = ch.get("n_tokens", token_count(chunk_text))
            # deterministic chunk_id
            chunk_hash = sha256_text(chunk_text)
            chunk_id = chunk_hash  # deterministic id

            # Validate token ranges and re-split if needed (simple rule)
            if n_tokens > 5000:
                logger.info("Oversized chunk (%d tokens) - skipping or resplitting", n_tokens)
                # Skip giant chunk (or you can resplit)
                review_queue.append({"chunk_text": chunk_text[:200], "issue": "oversized"})
                continue
            if n_tokens < 10:
                logger.warning("Very small chunk (%d tokens) - skipping", n_tokens)
                continue

            # Deduplication via SQLite chunks table (process-safe)
            reserved = try_reserve_chunk(MANIFEST_DB, chunk_hash, chunk_id, doc_id)
            if not reserved:
                logger.debug("Chunk already reserved/skipped (duplicate): %s", chunk_id)
                continue

            # Determine page_start / page_end using char offsets
            cstart = ch.get("char_start", 0)
            cend = ch.get("char_end", cstart + len(chunk_text))
            page_start = None
            page_end = None
            for idx, (pstart, pend) in enumerate(page_offsets):
                # if any overlap
                if cend >= pstart and cstart <= pend:
                    if page_start is None:
                        page_start = idx + 1
                    page_end = idx + 1
            if page_start is None:
                # fallback: approximate by proportion
                proportion = (cstart + cend) / 2 / max(1, cum)
                page_guess = int(proportion * max(1, len(page_offsets)))
                page_start = max(1, min(len(page_offsets), page_guess))
                page_end = page_start

            # Build chunk record
            chunk_record = {
                "chunk_id": chunk_id,
                "doc_id": doc_id,
                "doc_title": document_metadata["doc_title"],
                "category": document_metadata["category"],
                "folder": document_metadata["folder"],
                "source_path": document_metadata["source_path"],  # Already has forward slashes from metadata
                "page_start": page_start,
                "page_end": page_end,
                "char_start": cstart,
                "char_end": cend,
                "text": chunk_text,
                "n_tokens": int(n_tokens),
                "text_hash": chunk_hash,
                "version": document_metadata.get("version", "v1"),
                "created_at": time.time(),
                "encoding": "utf-8"
            }
            if "date" in document_metadata:
                chunk_record["date"] = document_metadata["date"]

            # Validate chunk quality
            is_valid, validation_issues = validate_chunk_quality(chunk_record)
            if not is_valid:
                logger.warning("Chunk validation failed for %s: %s", chunk_id, validation_issues)
                review_queue.append({
                    "chunk": chunk_record,
                    "issues": validation_issues,
                    "status": "validation_failed"
                })
                # still update chunk status to 'validation_failed' to avoid reprocessing duplicates
                update_chunk_status(MANIFEST_DB, chunk_hash, "validation_failed")
                continue

            # Near-duplicate check against local_text_map (optional)
            if local_text_map:
                is_nd, similar_hash, sim_score = detect_near_duplicates(chunk_text, local_text_map, threshold=0.95)
                if is_nd:
                    logger.debug("Near-duplicate detected for chunk %s similar to %s (%.2f)", chunk_id, similar_hash, sim_score)
                    review_queue.append({
                        "chunk": chunk_record,
                        "similar_to": similar_hash,
                        "similarity": sim_score,
                        "status": "near_duplicate"
                    })
                    update_chunk_status(MANIFEST_DB, chunk_hash, "near_duplicate")
                    continue

            # Add to local map to help subsequent near-dup checks
            local_text_map[chunk_hash] = chunk_text

            # Write to per-folder JSON
            append_chunk_json_per_folder(OUTPUT_DIR, chunk_record)
            created_chunks += 1
            # mark chunk as written
            update_chunk_status(MANIFEST_DB, chunk_hash, "written")

        # Log review queue issues but don't create files
        if review_queue:
            logger.warning("Found %d validation issues for %s (not saved to file)", len(review_queue), path)

        update_manifest(MANIFEST_DB, str(path), "processed", doc_hash, None)
        logger.info("Processed %s -> %d valid chunks", path, created_chunks)
        return str(path), None

    except Exception as e:
        logger.exception("Error processing %s: %s", path, e)
        update_manifest(MANIFEST_DB, str(path), "error", None, str(e))
        return str(path), str(e)

# ---------------- Batch orchestration ----------------
def scan_and_populate_manifest(root_folders: List[str]):
    ensure_output_dir()
    init_manifest(MANIFEST_DB)
    for rf in root_folders:
        p = Path(rf)
        if not p.exists():
            logger.warning("Root folder not found: %s", rf)
            continue
        for file in p.rglob("*"):
            if file.is_file() and file.suffix.lower() in (".pdf", ".docx", ".txt", ".md"):
                add_to_manifest(MANIFEST_DB, file, p.name)
    logger.info("Scan complete. Manifest is at %s", MANIFEST_DB)

def process_pending_files(workers: int = MAX_WORKERS):
    ensure_output_dir()
    init_manifest(MANIFEST_DB)
    rows = list_pending(MANIFEST_DB, limit=100000)
    paths = [r[0] for r in rows]
    if not paths:
        logger.info("No pending files to process.")
        return
    logger.info("Processing %d files with %d workers", len(paths), workers)
    with ProcessPoolExecutor(max_workers=workers) as exe:
        futures = {exe.submit(process_single_file, p): p for p in paths}
        for fut in as_completed(futures):
            p = futures[fut]
            try:
                path, err = fut.result()
                if err:
                    logger.error("File %s processed with error: %s", path, err)
                else:
                    logger.info("File %s processed successfully", path)
            except Exception as e:
                logger.exception("Worker failed for %s: %s", p, e)

# ---------------- Advanced text cleaning (kept single implementation) ----------------
def advanced_text_cleaning(text: str) -> str:
    if not text:
        return ""
    try:
        lines = text.split('\n')
        page_patterns = [
            r'^\s*\d+\s*$',  # standalone numbers
            r'^\s*Page\s+\d+\s*$',  # "Page 1"
            r'^\s*\d+\s+of\s+\d+\s*$',  # "1 of 10"
            r'^\s*-\s*\d+\s*-\s*$',  # "- 1 -"
            r'^\s*\|\s*\d+\s*\|\s*$',  # "| 1 |"
        ]
        cleaned_lines = []
        for line in lines:
            is_page_number = any(re.match(pattern, line, re.IGNORECASE) for pattern in page_patterns)
            if not is_page_number and line.strip():
                cleaned_lines.append(line)
        text = '\n'.join(cleaned_lines)
        text = re.sub(r'(\w)-\s*\n\s*(\w)', r'\1\2', text)
        text = re.sub(r'\r\n', '\n', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r'[ \t]+', ' ', text)
        text = re.sub(r' +\n', '\n', text)
        text = re.sub(r'\n +', '\n', text)
        text = re.sub(r'[^\w\s\.,;:!?\'"()\-\[\]{}/@#$%&*+=<>|\\~`]', '', text)
        return text.strip()
    except Exception as e:
        logger.warning("Error in advanced text cleaning: %s", e)
        return text.strip()

# ---------------- Embedding & upsert placeholder ----------------
def run_embedding_upsert():
    """
    Read per-folder JSON files and compute embeddings + upsert to vector DB (Supabase/pgvector).
    This is a placeholder. Implement your provider here.

    Recommended steps:
    - Read each <safe_folder>.json
    - Batch embed chunk["text"] with your SentenceTransformer or OpenAI embeddings
    - Upsert rows to Supabase `documents` table with embedding vector and metadata
    - Update chunks table status -> 'embedded' / 'upserted' after success
    """
    ensure_output_dir()
    init_manifest(MANIFEST_DB)
    json_files = list(OUTPUT_DIR.glob("*.json"))
    if not json_files:
        logger.info("No per-folder JSON files found in %s", OUTPUT_DIR)
        return

    logger.info("Found %d JSON files for embedding", len(json_files))
    for js in json_files:
        logger.info("Embedding file: %s", js)
        # read file and collect chunks for batching
        batch = []
        try:
            with open(js, 'r', encoding='utf-8') as f:
                chunks = json.load(f)
                for rec in chunks:
                    batch.append(rec)
                    if len(batch) >= EMBED_BATCH_SIZE:
                        _embed_and_upsert_batch(batch)
                        batch = []
                if batch:
                    _embed_and_upsert_batch(batch)
        except Exception as e:
            logger.error("Error reading JSON file %s: %s", js, e)
    logger.info("Embedding placeholder finished. Implement _embed_and_upsert_batch with your provider.")

def _embed_and_upsert_batch(batch: List[Dict]):
    """
    Implement actual embedding and upsert to your vector DB.
    This function must:
     - Compute embeddings for batch texts
     - Upsert to Supabase (or other vector DB) with embedding and metadata
     - Update chunks table status for each text_hash to 'embedded' or 'upserted'
    For now we will mark them as 'embedded' to avoid reprocessing in the placeholder.
    """
    logger.info("Pretend embedding batch of %d items", len(batch))
    conn = sqlite3.connect(str(MANIFEST_DB))
    c = conn.cursor()
    now = time.time()
    for rec in batch:
        text_hash = rec.get("text_hash")
        if not text_hash:
            continue
        try:
            # TODO: call embedding provider and upsert into DB here.
            # For now we simply update status to 'embedded' so pipeline won't re-embed
            c.execute("UPDATE chunks SET status = ?, updated_at = ? WHERE text_hash = ?", ("embedded", now, text_hash))
        except Exception as e:
            logger.warning("Failed to mark chunk embedded: %s", e)
    conn.commit()
    conn.close()

# ---------------- CLI ----------------
def parse_args():
    p = argparse.ArgumentParser(description="Preprocessing pipeline for documents (per-folder JSON)")
    p.add_argument("--scan-only", action="store_true", help="Scan folders and populate manifest")
    p.add_argument("--process", action="store_true", help="Process pending files (extract + chunk)")
    p.add_argument("--embed", action="store_true", help="Run embedding & upsert (placeholder)")
    p.add_argument("--workers", type=int, default=MAX_WORKERS, help="Parallel workers for processing")
    return p.parse_args()

def main():
    args = parse_args()
    if args.scan_only:
        scan_and_populate_manifest(ROOT_FOLDERS)
    elif args.process:
        process_pending_files(workers=args.workers)
    elif args.embed:
        run_embedding_upsert()
    else:
        print("Use --scan-only, --process, or --embed")

if __name__ == "__main__":
    main()
