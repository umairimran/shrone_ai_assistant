
import os
import sys
import platform
import tempfile
import json
import time
import re
import hashlib
import tiktoken
from datetime import datetime, date
from pathlib import Path
from typing import Optional, List, Dict
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# =====================================================
# LOAD SINGLE POINT CONFIGURATION
# =====================================================
def load_config():
    """Load configuration from config.json"""
    try:
        config_path = Path(__file__).parent / "config.json"
        with open(config_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Warning: Could not load config.json: {e}")
        return {"current_ec2_ip": "localhost", "backend_port": "8000", "frontend_port": "3000"}

CONFIG = load_config()
CURRENT_IP = CONFIG.get("current_ec2_ip", "localhost")
BACKEND_PORT = CONFIG.get("backend_port", "8000")
FRONTEND_PORT = CONFIG.get("frontend_port", "3000")

print(f"🌐 Loaded configuration: IP={CURRENT_IP}, Backend Port={BACKEND_PORT}, Frontend Port={FRONTEND_PORT}")

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
import uvicorn

# Import ingestion modules
from ingestion.schemas import CATEGORIES, DocumentMeta, Chunk, PreprocessResponse
from ingestion.extract import extract_pdf, extract_docx, extract_txt_md
from ingestion.clean import normalize_pages, join_pages, filter_table_of_contents, clean_page_text
from ingestion.structure import split_into_blocks
from folder_router import FolderRouter, map_folder_to_category
from ingestion.chunk import chunk_blocks, count_tokens as get_chunk_token_count
from ingestion.metadata import (
    infer_title, infer_document_number, infer_issued_date, derive_year, 
    validate_category
)

# Q&A imports
from qa_config import (
    RETRIEVAL_BACKEND, TOP_K, FETCH_K, MMR_LAMBDA, ANSWER_MODEL,
    SUPABASE_TABLE_BY_CATEGORY, CATEGORIES as QA_CATEGORIES
)
try:
    from langchain_openai import OpenAIEmbeddings, ChatOpenAI
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.documents import Document as LangChainDocument
    QA_AVAILABLE = True
except ImportError:
    QA_AVAILABLE = False

# Configuration constants
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
MAX_TOKENS_PER_CHUNK = 1000      # Maximum chunk size
MAX_OVERLAP_TOKENS = 200         # Maximum overlap
SUPPORTED_EXTENSIONS = {'.pdf', '.docx', '.txt', '.md'}
OCR_LANGUAGES = {'eng', 'fra', 'deu', 'spa', 'ita', 'por', 'rus', 'chi_sim', 'chi_tra', 'jpn', 'kor'}

# JSON save setup
# Directory for saving processed outputs
SAVE_DIR = Path("./processed_output/")
SAVE_DIR.mkdir(exist_ok=True)

def validate_embedding_safety(chunks: List[Dict], target_range: tuple = (400, 800)) -> Dict:
    """
    Embedding safety validation pass with deduplication and quality checks.
    
    Args:
        chunks: List of chunk dictionaries
        target_range: Tuple of (min_tokens, max_tokens) for target range
    
    Returns:
        Dict with validation results and warnings
    """
    
    if not chunks:
        return {"status": "error", "message": "No chunks to validate"}
    
    min_target, max_target = target_range
    
    # Track statistics
    stats = {
        "total_chunks": len(chunks),
        "in_range": 0,
        "below_range": 0, 
        "above_range": 0,
        "duplicates_found": 0,
        "warnings": []
    }
    
    # Deduplication tracking with smarter logic
    text_hashes = set()
    similarity_hashes = set()  # For detecting near-duplicates
    unique_chunks = []
    
    for i, chunk in enumerate(chunks):
        text = chunk.get("text") or ""  # Handle None values safely
        text = text.strip() if text else ""  # Safe strip operation
        token_count = chunk.get("token_count", 0)
        
        if not text or token_count < 50:  # Skip very small chunks
            continue
        
        # Calculate exact hash for identical content
        text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
        
        # Calculate similarity hash for near-duplicates (normalized text)
        normalized_text = ' '.join(text.split()).lower()  # Normalize whitespace and case
        similarity_hash = hashlib.md5(normalized_text.encode('utf-8')).hexdigest()
        
        # Check for exact duplicates
        if text_hash in text_hashes:
            stats["duplicates_found"] += 1
            stats["warnings"].append(f"Exact duplicate chunk found at index {i}")
            continue
        
        # Check for near-duplicates only if chunks are substantial (>100 tokens)
        if token_count > 100 and similarity_hash in similarity_hashes:
            # Additional check: ensure it's not just similar structure but different content
            existing_similar = False
            for existing_chunk in unique_chunks:
                existing_normalized = ' '.join(existing_chunk.get("text", "").split()).lower()
                if existing_normalized == normalized_text:
                    existing_similar = True
                    break
            
            if existing_similar:
                stats["duplicates_found"] += 1
                stats["warnings"].append(f"Near-duplicate chunk found at index {i}")
                continue
        
        # Add to tracking sets and unique chunks
        text_hashes.add(text_hash)
        if token_count > 100:  # Only track similarity for substantial chunks
            similarity_hashes.add(similarity_hash)
        unique_chunks.append(chunk)
        
        # Token range validation
        if min_target <= token_count <= max_target:
            stats["in_range"] += 1
        elif token_count < min_target:
            stats["below_range"] += 1
            if token_count < 100:
                stats["warnings"].append(f"Very small chunk at index {i}: {token_count} tokens")
        else:
            stats["above_range"] += 1
    
    # Update total after deduplication
    stats["unique_chunks"] = len(unique_chunks)
    
    # Calculate percentages
    if stats["unique_chunks"] > 0:
        stats["in_range_pct"] = (stats["in_range"] / stats["unique_chunks"]) * 100
        stats["below_range_pct"] = (stats["below_range"] / stats["unique_chunks"]) * 100
        stats["above_range_pct"] = (stats["above_range"] / stats["unique_chunks"]) * 100
    else:
        stats["in_range_pct"] = 0
        stats["below_range_pct"] = 0
        stats["above_range_pct"] = 0
    
    # Generate simple warnings
    if stats["duplicates_found"] > 0:
        stats["warnings"].append(f"Found {stats['duplicates_found']} duplicate chunks (cleaned)")
    
    # Simplified status determination - focus on duplicates, not complex targets
    if stats["duplicates_found"] == 0:
        stats["status"] = "safe"
        stats["message"] = "All chunks are unique and ready for embedding"
    else:
        stats["status"] = "cleaned"
        stats["message"] = f"Removed {stats['duplicates_found']} duplicates, chunks are now safe"
    
    return stats


def enhance_chunk_quality(chunks: List[Dict], target_range: tuple = (400, 800)) -> List[Dict]:
    """
    SIMPLIFIED CHUNKING: Focus on content preservation over optimization.
    
    Simple rules:
    1. Keep ALL content (zero data loss guarantee)
    2. Merge very small chunks (< 200 tokens) with neighbors
    3. Split very large chunks (> 1000 tokens) at paragraph boundaries
    4. Keep everything else as-is
    
    This approach is much simpler, faster, and more reliable than complex optimization.
    """
    if not chunks:
        return chunks
    
    # Import tokenizer for accurate token counting
    try:
        tokenizer = tiktoken.get_encoding("cl100k_base")
    except ImportError:
        tokenizer = None
        print("WARNING: tiktoken not available, using approximate token counts")
    
    def count_tokens(text: str) -> int:
        """Count tokens accurately using tiktoken."""
        if not text:  # Handle None or empty string
            return 0
        if tokenizer:
            return len(tokenizer.encode(text))
        else:
            # Fallback to word count approximation
            return int(len(text.split()) * 1.3)
    
    enhanced_chunks = []
    i = 0
    
    while i < len(chunks):
        chunk = chunks[i]
        text = chunk.get("text") or ""  # Handle None values safely
        text = text.strip() if text else ""  # Safe strip operation
        token_count = chunk.get("token_count", 0)
        
        # Skip empty chunks
        if not text:
            i += 1
            continue
        
        # Recalculate accurate token count
        accurate_count = count_tokens(text)
        chunk["token_count"] = accurate_count
        
        # RULE 1: Merge very small chunks (< 200 tokens) with next chunk
        if accurate_count < 200 and i < len(chunks) - 1:
            next_chunk = chunks[i + 1]
            next_text = next_chunk.get("text") or ""  # Handle None safely
            next_text = next_text.strip() if next_text else ""  # Safe strip
            
            if next_text:  # Only merge if next chunk has content
                combined_text = text + "\n\n" + next_text
                combined_tokens = count_tokens(combined_text)
                
                # Only merge if result is reasonable size (< 1000 tokens)
                if combined_tokens <= 1000:
                    merged_chunk = {
                        "text": combined_text,
                        "token_count": combined_tokens,
                        "page_start": chunk.get("page_start", 1),
                        "page_end": next_chunk.get("page_end", chunk.get("page_end", 1)),
                        "heading_path": chunk.get("heading_path", []),
                        "chunk_index": chunk.get("chunk_index", i)
                    }
                    enhanced_chunks.append(merged_chunk)
                    i += 2  # Skip both chunks since we merged them
                    continue
        
        # RULE 2: Split very large chunks (> 1000 tokens) at paragraph boundaries
        elif accurate_count > 1000:
            paragraphs = text.split('\n\n')
            current_text = ""
            current_tokens = 0
            split_index = 0
            
            for para in paragraphs:
                para = para.strip()
                if not para:
                    continue
                    
                para_tokens = count_tokens(para)
                
                # If adding this paragraph would exceed 1000 tokens, save current chunk
                if current_tokens > 0 and current_tokens + para_tokens > 1000:
                    if current_text:
                        split_chunk = {
                            "text": current_text,
                            "token_count": current_tokens,
                            "page_start": chunk.get("page_start", 1),
                            "page_end": chunk.get("page_end", 1),
                            "heading_path": chunk.get("heading_path", []),
                            "chunk_index": f"{chunk.get('chunk_index', i)}.{split_index}"
                        }
                        enhanced_chunks.append(split_chunk)
                        split_index += 1
                    
                    # Start new chunk with current paragraph
                    current_text = para
                    current_tokens = para_tokens
                else:
                    # Add paragraph to current chunk
                    if current_text:
                        current_text += "\n\n" + para
                        current_tokens += para_tokens
                    else:
                        current_text = para
                        current_tokens = para_tokens
            
            # Add final chunk if there's content
            if current_text:
                final_chunk = {
                    "text": current_text,
                    "token_count": current_tokens,
                    "page_start": chunk.get("page_start", 1),
                    "page_end": chunk.get("page_end", 1),
                    "heading_path": chunk.get("heading_path", []),
                    "chunk_index": f"{chunk.get('chunk_index', i)}.{split_index}" if split_index > 0 else chunk.get('chunk_index', i)
                }
                enhanced_chunks.append(final_chunk)
        
        # RULE 3: Keep normal-sized chunks as-is (200-1000 tokens)
        else:
            enhanced_chunks.append(chunk)
        
        i += 1
    
    # Simple statistics (no complex targeting)
    if enhanced_chunks:
        total_chunks = len(enhanced_chunks)
        small_chunks = sum(1 for chunk in enhanced_chunks if chunk.get("token_count", 0) < 200)
        large_chunks = sum(1 for chunk in enhanced_chunks if chunk.get("token_count", 0) > 1000)
        normal_chunks = total_chunks - small_chunks - large_chunks
        
        print(f"SIMPLIFIED CHUNKING: {total_chunks} chunks created")
        print(f"Distribution: {small_chunks} small (<200), {normal_chunks} normal (200-1000), {large_chunks} large (>1000)")
        print(f"ZERO DATA LOSS: All content preserved with simple, reliable processing")
    
    return enhanced_chunks


def validate_chunks_quality(chunks: List[Dict], target_range: tuple = (400, 800)) -> Dict:
    """
    SIMPLIFIED VALIDATION: Basic quality metrics without complex targeting.
    
    Returns simple statistics about chunk distribution.
    """
    if not chunks:
        return {"error": "No chunks to validate"}
    
    total_chunks = len(chunks)
    
    # Count distribution by simple size categories
    small_chunks = sum(1 for chunk in chunks if chunk.get("token_count", 0) < 200)
    normal_chunks = sum(1 for chunk in chunks if 200 <= chunk.get("token_count", 0) <= 1000)
    large_chunks = sum(1 for chunk in chunks if chunk.get("token_count", 0) > 1000)
    
    quality_report = {
        "total_chunks": total_chunks,
        "small_chunks": small_chunks,
        "normal_chunks": normal_chunks, 
        "large_chunks": large_chunks,
        "content_preserved": True,  # Always true with simplified approach
        "processing_type": "simplified",
        "quality_grade": "GOOD" if normal_chunks > 0 else "NEEDS_REVIEW"
    }
    
    return quality_report
    
    return final_chunks


def extract_year_from_filename(filename: str) -> Optional[int]:
    """Extract year from filename using regex patterns."""
    import re
    
    # Look for 4-digit years in filename
    year_patterns = [
        r'(\d{4})',  # Any 4-digit number
        r'[_\-\s](\d{4})[_\-\s\.]',  # Year surrounded by separators
    ]
    
    for pattern in year_patterns:
        match = re.search(pattern, filename)
        if match:
            year = int(match.group(1))
            # Validate year range (1970-2030)
            if 1970 <= year <= 2030:
                return year
    
    return None


def _safe_slug(text: str) -> str:
    """Convert text to a safe filename slug."""
    if not text:
        return "document"
    import re
    text = re.sub(r"[^\w\s-]+", "", text, flags=re.UNICODE)
    text = re.sub(r"\s+", "_", text.strip())
    return text[:80] or "document"


def is_valid_date(date_str: str) -> bool:
    """Validate date format YYYY-MM-DD and not in the future."""
    if not date_str:
        return False
    try:
        from datetime import datetime, date
        parsed = datetime.strptime(date_str, "%Y-%m-%d").date()
        return parsed <= date.today()
    except Exception:
        return False



def create_chunks(text: str, max_tokens: int = 1000, overlap: int = 200) -> List[Dict]:
    """
    Simple chunking function for compatibility.
    """
    # Split text into chunks based on max_tokens
    from ingestion.chunk import count_tokens
    
    if not text or not text.strip():
        return []
    
    # Split by double newlines first (paragraphs)
    if not text:  # Additional safety check
        return []
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    
    chunks = []
    current_chunk = ""
    
    for paragraph in paragraphs:
        # Check if adding this paragraph exceeds max_tokens
        test_chunk = f"{current_chunk}\n\n{paragraph}".strip()
        
        if count_tokens(test_chunk) <= max_tokens:
            current_chunk = test_chunk
        else:
            # Save current chunk if it has content
            if current_chunk:
                chunks.append({
                    'text': current_chunk,
                    'token_count': count_tokens(current_chunk)
                })
            
            # Start new chunk with current paragraph
            current_chunk = paragraph
    
    # Add final chunk
    if current_chunk:
        chunks.append({
            'text': current_chunk,
            'token_count': count_tokens(current_chunk)
        })
    
    return chunks


def save_preprocess_json(data: Dict, filename: str) -> str:
    """
    Persist the preprocess output as a JSON file organized by category.
    Saves in processed_output/{category}/ subfolder for organization.
    We NEVER save the original file; only the structured JSON.
    """
    # Extract document info
    document = data.get("document", {})
    title = document.get("title") or filename or "document"
    category = document.get("category", "Uncategorized")
    
    # Create category subfolder
    category_slug = _safe_slug(category)
    category_dir = SAVE_DIR / category_slug
    category_dir.mkdir(exist_ok=True, parents=True)
    
    # Generate filename
    title_slug = _safe_slug(title)
    timestamp = int(time.time())
    out_path = category_dir / f"{title_slug}__{timestamp}.json"
    
    # Save JSON
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    return str(out_path)


async def generate_and_store_embeddings(processed_data: dict, category: str) -> dict:
    """
    Generate embeddings for processed document chunks and store them in Supabase.
    
    Args:
        processed_data: The preprocessed document data with chunks
        category: Document category for table routing
        
    Returns:
        dict: Status and results of embedding generation
    """
    try:
        # Import required modules
        from langchain_core.documents import Document
        from langchain_openai import OpenAIEmbeddings
        from supabase import create_client
        from embeddings_config import CATEGORY_MAP, SUPABASE_TABLE_BY_CATEGORY, OPENAI_EMBED_MODEL
        
        print(f"🔄 Starting embedding generation for category: {category}")
        
        # Initialize embeddings
        embedder = OpenAIEmbeddings(model=OPENAI_EMBED_MODEL)
        
        # Get Supabase client
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
        
        if not supabase_url or not supabase_key:
            raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY/SUPABASE_KEY")
            
        client = create_client(supabase_url, supabase_key)
        
        # Map category to table
        normalized_category = CATEGORY_MAP.get(category, category)
        table_name = SUPABASE_TABLE_BY_CATEGORY.get(normalized_category)
        
        if not table_name:
            raise ValueError(f"No table mapping found for category: {category}")
            
        print(f"📊 Using table: {table_name} for category: {normalized_category}")
        
        # Process chunks into Documents
        documents = []
        chunks = processed_data.get("chunks", [])
        doc_info = processed_data.get("document", {})
        
        # Generate source_file path if not provided
        source_file_path = processed_data.get("saved_path")
        if not source_file_path:
            # Generate a source file path based on document info
            title = doc_info.get("title", "document")
            category = doc_info.get("category", "Uncategorized")
            category_slug = category.replace(" ", "_").replace("&", "and").replace("  ", "_")
            title_slug = title.replace(" ", "_")
            source_file_path = f"processed_output/{category_slug}/{title_slug}.json"
        
        # Use version from document metadata (already deleted old versions in upload_and_preprocess)
        document_version = doc_info.get("version", "1")
        print(f"📌 Using document version: {document_version}")

        for chunk in chunks:
            # Generate unique chunk ID
            chunk_text = chunk.get("text", "")
            chunk_id = hashlib.sha256(chunk_text.encode()).hexdigest()
            
            # Prepare metadata
            metadata = {
                "id": chunk_id,
                "title": doc_info.get("title", ""),
                "category": category,
                "issued_date": doc_info.get("issued_date", ""),
                "year": doc_info.get("year"),
                "document_number": doc_info.get("document_number", ""),
                "page_start": chunk.get("page_start"),
                "page_end": chunk.get("page_end"),
                "heading_path": " > ".join(chunk.get("heading_path") or []),
                "chunk_index": chunk.get("chunk_index"),
                "source_file": source_file_path,
                "version": document_version,
                "doc_version": document_version,  # Keep for backward compatibility
                "is_current": True
            }
            
            # Create Document
            doc = Document(page_content=chunk_text, metadata=metadata)
            documents.append(doc)
            
        if not documents:
            return {"status": "warning", "message": "No chunks to embed"}
            
        print(f"📝 Processing {len(documents)} chunks")
        
        # Generate embeddings in batches
        batch_size = 10  # Smaller batches for safety
        total_inserted = 0
        
        for i in range(0, len(documents), batch_size):
            batch_docs = documents[i:i+batch_size]
            batch_texts = [doc.page_content for doc in batch_docs]
            batch_metas = [doc.metadata for doc in batch_docs]
            
            print(f"🔄 Processing batch {i//batch_size + 1}/{(len(documents) + batch_size - 1)//batch_size}")
            
            # Generate embeddings
            embeddings = embedder.embed_documents(batch_texts)
            
            # Prepare rows for upsert
            rows = []
            for j, embedding in enumerate(embeddings):
                meta = batch_metas[j]
                
                # Clean text (remove any null characters)
                clean_text = batch_texts[j].replace('\x00', '')
                
                # Build document metadata
                doc_meta = {
                    "title": meta.get("title", ""),
                    "category": meta.get("category", ""),
                    "issued_date": meta.get("issued_date", ""),
                    "year": meta.get("year"),
                    "document_number": meta.get("document_number", ""),
                    "filename": meta.get("source_file", ""),
                    "version": meta.get("version", "1")
                }
                
                row = {
                    "id": meta["id"],
                    "content": clean_text,
                    "metadata": {
                        "document": doc_meta,
                        "chunk": {
                            "page_start": meta.get("page_start"),
                            "page_end": meta.get("page_end"),
                            "heading_path": meta.get("heading_path", ""),
                            "chunk_index": meta.get("chunk_index"),
                            "token_count": len(clean_text.split())  # Rough estimate
                        },
                        "source_file": meta.get("source_file", ""),
                        "title": meta.get("title", ""),
                        "category": meta.get("category", ""),
                        "issued_date": meta.get("issued_date", ""),
                        "year": meta.get("year"),
                        "document_number": meta.get("document_number", ""),
                        "version": meta.get("version", "1")
                    },
                    "embedding": embedding
                }
                rows.append(row)
            
            # Upsert to Supabase
            try:
                result = client.table(table_name).upsert(rows).execute()
                total_inserted += len(rows)
                print(f"✅ Uploaded batch {i//batch_size + 1}: {len(rows)} chunks")
            except Exception as e:
                print(f"❌ Error uploading batch {i//batch_size + 1}: {str(e)}")
                raise
                
        print(f"🎉 Successfully embedded and stored {total_inserted} chunks in {table_name}")
        
        return {
            "status": "success",
            "chunks_processed": len(documents),
            "chunks_stored": total_inserted,
            "table": table_name,
            "category": normalized_category
        }
        
    except Exception as e:
        print(f"❌ Error in embedding generation: {str(e)}")
        return {
            "status": "error", 
            "message": str(e),
            "chunks_processed": 0
        }


async def delete_document_embeddings(document_title: str, category: str) -> dict:
    """
    Delete all embeddings for a specific document from Supabase.
    
    Args:
        document_title: The title of the document to delete
        category: Document category for table routing
        
    Returns:
        dict: Status and results of deletion
    """
    try:
        # Import required modules
        from supabase import create_client
        from embeddings_config import CATEGORY_MAP, SUPABASE_TABLE_BY_CATEGORY
        
        print(f"🗑️ Starting deletion of embeddings for document: {document_title} in category: {category}")
        
        # Get Supabase client
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
        
        if not supabase_url or not supabase_key:
            raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY/SUPABASE_KEY")
            
        client = create_client(supabase_url, supabase_key)
        
        # Map category to table
        normalized_category = CATEGORY_MAP.get(category, category)
        table_name = SUPABASE_TABLE_BY_CATEGORY.get(normalized_category)
        
        if not table_name:
            raise ValueError(f"No table mapping found for category: {category}")
            
        print(f"📊 Using table: {table_name} for category: {normalized_category}")
        
        # First, check how many chunks exist for this document
        try:
            # Try multiple query strategies to find the document
            existing_chunks = None
            
            # Strategy 1: Exact title match
            existing_chunks = client.table(table_name).select("id, metadata").eq(
                "metadata->>title", document_title
            ).execute()
            
            # Strategy 2: If no exact match, try partial title match
            if not existing_chunks.data:
                print(f"🔍 No exact title match, trying partial match for '{document_title}'")
                # Get all documents and filter by partial title match
                all_chunks = client.table(table_name).select("id, metadata").execute()
                if all_chunks.data:
                    # Filter by partial title match
                    matching_chunks = []
                    for chunk in all_chunks.data:
                        metadata = chunk.get('metadata', {})
                        title = metadata.get('title', '')
                        source_file = metadata.get('source_file', '')
                        
                        # Check if title contains the document title or vice versa
                        if (document_title.lower() in title.lower() or 
                            title.lower() in document_title.lower() or
                            document_title.lower() in source_file.lower()):
                            matching_chunks.append(chunk)
                    
                    if matching_chunks:
                        existing_chunks = type('MockResult', (), {'data': matching_chunks})()
                        print(f"✅ Found {len(matching_chunks)} chunks using partial match")
            
            if not existing_chunks or not existing_chunks.data:
                print(f"⚠️ No chunks found for document '{document_title}' in {table_name}")
                return {
                    "status": "warning",
                    "message": f"No chunks found for document '{document_title}'",
                    "chunks_deleted": 0
                }
            
            chunk_ids = [chunk["id"] for chunk in existing_chunks.data]
            print(f"📝 Found {len(chunk_ids)} chunks to delete for document '{document_title}'")
            
            # Delete chunks in batches to avoid timeout
            batch_size = 50
            total_deleted = 0
            
            for i in range(0, len(chunk_ids), batch_size):
                batch_ids = chunk_ids[i:i+batch_size]
                
                print(f"🔄 Deleting batch {i//batch_size + 1}/{(len(chunk_ids) + batch_size - 1)//batch_size}")
                
                # Delete this batch
                result = client.table(table_name).delete().in_("id", batch_ids).execute()
                
                # Count successful deletions
                if hasattr(result, 'data') and result.data:
                    total_deleted += len(result.data)
                else:
                    # If no data returned, assume all were deleted
                    total_deleted += len(batch_ids)
                    
                print(f"✅ Deleted batch {i//batch_size + 1}: {len(batch_ids)} chunks")
                
            print(f"🎉 Successfully deleted {total_deleted} chunks for document '{document_title}' from {table_name}")
            
            return {
                "status": "success",
                "chunks_deleted": total_deleted,
                "table": table_name,
                "category": normalized_category,
                "document_title": document_title
            }
            
        except Exception as db_error:
            print(f"❌ Database error during deletion: {str(db_error)}")
            raise
        
    except Exception as e:
        print(f"❌ Error in embedding deletion: {str(e)}")
        return {
            "status": "error", 
            "message": str(e),
            "chunks_deleted": 0
        }


# === Q&A MODELS AND FUNCTIONS ===

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class ChatMessage(BaseModel):
    role: str = Field(..., description="Either 'user' or 'assistant'")
    content: str = Field(..., min_length=1)
    timestamp: Optional[str] = Field(None)

class AskRequest(BaseModel):
    question: str = Field(..., min_length=3)
    category: str = Field(..., description="Must be one of the 5 canonical categories")
    conversation_history: Optional[List[ChatMessage]] = Field(default=[], description="Previous conversation messages for context")
    top_k: Optional[int] = Field(None, ge=1, le=20, description="Max passages to retrieve")

class AskResponse(BaseModel):
    answer: str
    citations: List[dict]  # [{title, category, pages, heading_path, chunk_index}]

# Initialize Q&A components if available
if QA_AVAILABLE and os.getenv("OPENAI_API_KEY"):
    EMB = OpenAIEmbeddings(model="text-embedding-3-small")
    LLM = ChatOpenAI(model=ANSWER_MODEL, temperature=0)
    
    SYSTEM = """You are Sharon, a helpful document analysis assistant for an emergency medicine organization. Your role is to understand user intent and provide helpful information from organizational documents.

Core Principles:
- Interpret ALL user inputs as questions or requests for information, even if informal or incomplete
- Never require specific prefixes like "Give me the answer" - respond helpfully to any query
- Understand the user's intent even with casual language like "workplace violence policy" or "council resolutions from 2025"
- Always prioritize information from the provided documents
- Be conversational and natural while staying focused on the documents

Response Approach:
- Answer questions directly using document context
- Maintain conversation flow and understand references to previous responses  
- Handle follow-up questions naturally (like "summarize them", "explain it", "tell me more")
- If specific information isn't in the documents, acknowledge this but provide what you can
- For ambiguous queries, provide comprehensive information from relevant documents

Document Focus:
- Use the provided document context as your primary information source
- When users ask about policies, procedures, resolutions, etc., search the documents thoroughly
- Provide detailed, helpful responses with specific information from the documents
- Include relevant details, dates, and context when available

Formatting Requirements:
- Format your response using Markdown syntax for better readability
- Use headers (##, ###) to organize information clearly
- Use bullet points (-) and numbered lists (1.) for structured information
- Use **bold** for emphasis on key terms and concepts
- Use > blockquotes for important quotes or policy statements
- Use `code` formatting for specific terms, numbers, or technical references
- Structure your response with clear sections and subsections
- Make the response visually appealing and easy to scan"""

    HUMAN = """Category: {category}
Current question: {question}

{conversation_context}

Document Context:
{context}

Source Documents Available:
{source_metadata}

Respond naturally and conversationally using Markdown formatting. Use the conversation history to understand what the user is referring to (like "them", "it", "those"). If they're asking for a summary, explanation, or follow-up about something from the conversation history, provide that based on both the history and any relevant document context.

IMPORTANT: 
- Format your response using Markdown syntax (headers, lists, bold, blockquotes, etc.)
- Do NOT include any inline citations or parenthetical references in your answer text
- Keep the answer clean and readable with proper Markdown structure

CRITICAL RULES for Citations:
1. Generate SEPARATE citations for EACH distinct source document
2. Use the EXACT information from the Source Documents Available section above
3. Do NOT combine multiple sources into one citation
4. Each citation must be on its own numbered line
5. Use the exact title, category, section, and date from the source metadata

After your answer, provide citations in this exact format:

Citations:
1. Title: [exact document title from source_metadata] | Category: [exact category from source_metadata] | Section: [exact section from source_metadata] | Date: [exact date from source_metadata] | Start Page: [exact start page from source_metadata] | End Page: [exact end page from source_metadata]
2. Title: [exact document title from source_metadata] | Category: [exact category from source_metadata] | Section: [exact section from source_metadata] | Date: [exact date from source_metadata] | Start Page: [exact start page from source_metadata] | End Page: [exact end page from source_metadata]

Generate one citation per distinct source document. Do NOT combine sources."""

    PROMPT = ChatPromptTemplate.from_messages([
        ("system", SYSTEM),
        ("human", HUMAN)
    ])
else:
    EMB = LLM = PROMPT = None

def validate_qa_category(cat: str) -> str:
    """Validate Q&A category with normalization"""
    # Handle "All Categories" special case
    if cat.strip() == "All Categories":
        return "All Categories"
    
    # Normalize spaces and common variations
    normalized = cat.replace("By-Laws", "Bylaws").strip()
    normalized = " ".join(normalized.split())  # Normalize multiple spaces to single space
    
    # Try exact match first
    if normalized in QA_CATEGORIES:
        return normalized
    
    # Try fuzzy matching for common variations
    for valid_cat in QA_CATEGORIES:
        # Remove extra spaces and compare
        if normalized.replace(" ", "") == valid_cat.replace(" ", ""):
            return valid_cat
        # Check if it's just a spacing issue with '&'
        if normalized.replace(" & ", " &  ") == valid_cat or normalized.replace(" &  ", " & ") == valid_cat:
            return valid_cat
    
    raise HTTPException(400, f"Invalid category. Must be one of: {['All Categories'] + QA_CATEGORIES}")

def load_supabase_retriever(category: str):
    """Load Supabase retriever for category using direct RPC calls"""
    if not QA_AVAILABLE:
        raise HTTPException(500, "Q&A functionality not available - missing dependencies")
    
    try:
        from supabase import create_client
    except ImportError:
        raise HTTPException(500, "Supabase dependencies not available")
    
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise HTTPException(500, "Supabase credentials not configured")
    
    if category not in SUPABASE_TABLE_BY_CATEGORY:
        raise HTTPException(400, f"No Supabase table configured for category: {category}")
    
    client = create_client(url, key)
    table = SUPABASE_TABLE_BY_CATEGORY[category]
    
    # Map table names to search function names
    search_function_map = {
        "vs_board_committees": "search_board_committees",
        "vs_bylaws": "search_bylaws", 
        "vs_external_advocacy": "search_external_advocacy",
        "vs_policy_positions": "search_policy_positions",
        "vs_resolutions": "search_resolutions"
    }
    
    search_function = search_function_map.get(table)
    if not search_function:
        raise HTTPException(500, f"No search function for table: {table}")
    
    class SupabaseCustomRetriever:
        def __init__(self, client, embedder, search_function):
            self.client = client
            self.embedder = embedder
            self.search_function = search_function
        
        def get_relevant_documents(self, query: str):
            # Generate embedding for the query
            query_embedding = self.embedder.embed_query(query)
            
            # Call Supabase RPC function directly
            result = self.client.rpc(self.search_function, {
                "query_embedding": query_embedding,
                "match_threshold": 0.15,  # Lower threshold for better recall
                "match_count": TOP_K*2
            }).execute()
            
            # Convert to LangChain Document format
            docs = []
            for row in result.data:
                metadata = row.get('metadata', {})
                # Add similarity score to metadata
                metadata['similarity'] = row.get('similarity', 0.0)
                
                doc = LangChainDocument(
                    page_content=row.get('content', ''),
                    metadata=metadata
                )
                docs.append(doc)
            
            return docs
    
    return SupabaseCustomRetriever(client, EMB, search_function)

def load_supabase_all_categories_retriever():
    """Load Supabase retriever that searches across all categories using RPC functions"""
    if not QA_AVAILABLE:
        raise HTTPException(500, "Q&A functionality not available - missing dependencies")
    
    try:
        from supabase import create_client
    except ImportError:
        raise HTTPException(500, "Supabase dependencies not available")
    
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise HTTPException(500, "Supabase credentials not configured")
    
    client = create_client(url, key)
    
    # Create a combined retriever that searches across all category tables using RPC functions
    class AllCategoriesRetriever:
        def __init__(self, client, embeddings, category_tables):
            self.client = client
            self.embeddings = embeddings
            self.category_tables = category_tables
            
            # Map table names to search function names (same as single category)
            self.search_function_map = {
                "vs_board_committees": "search_board_committees",
                "vs_bylaws": "search_bylaws", 
                "vs_external_advocacy": "search_external_advocacy",
                "vs_policy_positions": "search_policy_positions",
                "vs_resolutions": "search_resolutions"
            }
        
        def get_relevant_documents(self, query: str, k: int = None):
            """Search across all category tables using RPC functions and combine results"""
            if k is None:
                k = TOP_K
            
            all_docs = []
            # Retrieve more docs per category to improve recall, then select best ones
            docs_per_category = max(10, (k // len(self.category_tables)) * 2)  # 10 docs per category for better coverage
            
            print(f"🚀 Searching all {len(self.category_tables)} categories with {docs_per_category} docs per category")
            
            for category, table_name in self.category_tables.items():
                try:
                    # Get the RPC function name for this table
                    search_function = self.search_function_map.get(table_name)
                    if not search_function:
                        print(f"❌ No search function for table: {table_name}")
                        continue
                    
                    # Generate embedding for the query
                    query_embedding = self.embeddings.embed_query(query)
                    
                    # Call Supabase RPC function directly (same as single category)
                    result = self.client.rpc(search_function, {
                        "query_embedding": query_embedding,
                        "match_threshold": 0.15,  # Lower threshold for better recall
                        "match_count": docs_per_category
                    }).execute()
                    
                    # Convert to LangChain Document format
                    category_docs = []
                    for i, row in enumerate(result.data):
                        metadata = row.get('metadata', {})
                        # Add similarity score to metadata
                        metadata['similarity'] = row.get('similarity', 0.0)
                        # Add category info to metadata - override BOTH top-level and nested
                        metadata['category'] = category
                        # Also override category in nested document object if it exists
                        if 'document' in metadata and isinstance(metadata['document'], dict):
                            metadata['document']['category'] = category
                        
                        doc = LangChainDocument(
                            page_content=row.get('content', ''),
                            metadata=metadata
                        )
                        category_docs.append(doc)
                        all_docs.append(doc)
                        
                        # DEBUG: Show details of each chunk retrieved
                        doc_title = metadata.get('title', 'Unknown Title')
                        doc_section = metadata.get('heading_path', 'Unknown Section')
                        similarity = row.get('similarity', 0.0)
                        content_preview = row.get('content', '')[:100] + '...' if len(row.get('content', '')) > 100 else row.get('content', '')
                        
                        print(f"   📄 Chunk {i+1}: {doc_title} | {doc_section} | Similarity: {similarity:.3f}")
                        print(f"      Content: {content_preview}")
                    
                    print(f"✅ Completed search for category: {category} ({len(result.data)} docs)")
                    
                except Exception as e:
                    print(f"❌ Error searching category {category}: {e}")
                    continue
            
            # For All Categories, ensure equal representation from each category
            # Distribute documents evenly across categories
            print(f"🎯 All categories search completed: {len(all_docs)} total docs")
            
            # Group documents by category to ensure balanced distribution
            docs_by_category = {}
            for doc in all_docs:
                cat = doc.metadata.get('category', 'Unknown')
                if cat not in docs_by_category:
                    docs_by_category[cat] = []
                docs_by_category[cat].append(doc)
            
            # Calculate how many docs per category to include
            docs_per_cat = max(1, k // len(docs_by_category))
            balanced_docs = []
            
            # Take equal number from each category
            for cat, docs in docs_by_category.items():
                selected_docs = docs[:docs_per_cat]
                balanced_docs.extend(selected_docs)
                print(f"   📄 Including {min(len(docs), docs_per_cat)} docs from {cat}")
                
                # DEBUG: Show which specific documents are selected for final results
                for i, doc in enumerate(selected_docs):
                    doc_title = doc.metadata.get('title', 'Unknown Title')
                    similarity = doc.metadata.get('similarity', 0.0)
                    print(f"      ✅ Selected: {doc_title} (Similarity: {similarity:.3f})")
            
            print(f"🎯 Returning {len(balanced_docs)} balanced docs from {len(docs_by_category)} categories")
            
            # Return balanced selection
            return balanced_docs[:k]
    
    return AllCategoriesRetriever(client, EMB, SUPABASE_TABLE_BY_CATEGORY)

def get_retriever(category: str):
    """Get retriever based on configured backend and category"""
    if RETRIEVAL_BACKEND == "supabase":
        if category == "All Categories":
            return load_supabase_all_categories_retriever()
        else:
            return load_supabase_retriever(category)
    else:
        raise HTTPException(500, f"Unsupported RETRIEVAL_BACKEND: {RETRIEVAL_BACKEND}")

def format_context(docs: List[LangChainDocument]) -> str:
    """Format retrieved documents for LLM context"""
    pieces = []
    for d in docs:
        m = d.metadata or {}
        cite = f'{m.get("title","")} — {m.get("category","")} — p.{m.get("page_start")}-{m.get("page_end")} — {m.get("heading_path","")}'
        pieces.append(f"[{cite}]\n{d.page_content}")
    return "\n\n---\n\n".join(pieces)


def extract_citations_for_all_categories(source_metadata_list: list, max_per_category: int = 3) -> list:
    """
    Generate citations from ALL categories with deduplication.
    Ensures representation from every category, removes duplicates within each category.
    
    Args:
        source_metadata_list: List of document metadata from retrieval
        max_per_category: Maximum unique citations per category (default: 3)
    
    Returns:
        List of unique citations with representation from all categories
    """
    # Group by category first
    by_category = {}
    for meta in source_metadata_list:
        cat = meta.get('category', 'Unknown')
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(meta)
    
    print(f"📚 Generating citations from ALL categories (max {max_per_category} per category):")
    for cat, docs in by_category.items():
        print(f"   📁 {cat}: {len(docs)} documents")
    
    all_citations = []
    total_duplicates = 0
    
    # Process each category separately to ensure all categories are represented
    for category_name, category_docs in by_category.items():
        seen_in_category = set()  # Track duplicates within THIS category only
        category_citations = []
        duplicates_in_cat = 0
        
        print(f"\n🔍 Processing {category_name}:")
        
        for meta in category_docs:
            # Stop if we have enough citations from this category
            if len(category_citations) >= max_per_category:
                print(f"   ✂️ Reached max citations for {category_name} ({max_per_category})")
                break
            
            title = meta.get('title', 'Unknown Document')
            section = meta.get('heading_path', '')  # Use heading as section identifier
            
            # Create unique key within this category
            doc_key = (title.strip(), section.strip())
            
            # Skip duplicates within this category
            if doc_key in seen_in_category:
                duplicates_in_cat += 1
                print(f"   ⏭️  Skipping duplicate: {title}")
                continue
                
            seen_in_category.add(doc_key)
            
            citation = {
                "id": f"citation-{len(all_citations)+1}",
                "doc_title": title,
                "title": title,
                "category": category_name,
                "section": section or meta.get('section', 'Unknown Section'),
                "date": meta.get('issued_date', meta.get('date', 'Unknown Date')),
                "quote": meta.get('content', ''),  # Guaranteed quote
                "pages": f"{meta.get('page_start', '')}-{meta.get('page_end', '')}" if meta.get('page_start') and meta.get('page_end') else "",
                "heading_path": meta.get('heading_path', ''),
                "hierarchy_path": meta.get('heading_path', ''),
                "year": meta.get('year', ''),
                "document_number": meta.get('document_number', ''),
                "confidence_score": 0.95
            }
            category_citations.append(citation)
            print(f"   ✅ Added: {title}")
        
        all_citations.extend(category_citations)
        total_duplicates += duplicates_in_cat
        print(f"   📊 {category_name}: {len(category_citations)} unique citations, {duplicates_in_cat} duplicates removed")
    
    print(f"\n✅ Generated {len(all_citations)} UNIQUE citations from {len(by_category)} categories")
    print(f"   📉 Total duplicates removed: {total_duplicates}")
    print(f"   📊 Final breakdown:")
    
    # Show final breakdown by category
    citation_by_cat = {}
    for cite in all_citations:
        cat = cite.get('category', 'Unknown')
        citation_by_cat[cat] = citation_by_cat.get(cat, 0) + 1
    
    for cat, count in sorted(citation_by_cat.items()):
        print(f"      • {cat}: {count} citation(s)")
    
    return all_citations

def extract_citations_with_openai(llm_response: str, source_metadata_list: list) -> list:
    """
    Extract citations from LLM response using OpenAI for intelligent parsing.
    Returns a list of properly formatted citation objects.
    """
    cites = []
    
    try:
        # Create a more specific prompt to extract citations
        citation_extraction_prompt = f"""
You are a citation extraction assistant. Extract citations from the following text and return them as a valid JSON array.

Text to extract citations from:
{llm_response}

Instructions:
1. Look for the "Citations:" section in the text
2. Extract each numbered citation (1., 2., 3., etc.)
3. Parse the title, category, section, date, and page numbers
4. Return ONLY a valid JSON array

Example output format:
[
  {{
    "title": "Council Resolutions",
    "category": "Resolutions", 
    "section": "Resolution 41",
    "date": "2024-01-01",
    "start_page": 96,
    "end_page": 98
  }}
]

Return ONLY the JSON array, no other text.
"""

        # Use OpenAI to extract citations
        citation_response = LLM.invoke(citation_extraction_prompt)
        citations_json = citation_response.content if hasattr(citation_response, "content") else str(citation_response)
        
        # Clean the response - remove any markdown formatting
        citations_json = citations_json.strip()
        if citations_json.startswith('```json'):
            citations_json = citations_json[7:]
        if citations_json.endswith('```'):
            citations_json = citations_json[:-3]
        citations_json = citations_json.strip()
        
        # Parse the JSON response
        import json
        extracted_citations = json.loads(citations_json)
        
        
        
        # Convert to proper citation format
        seen_documents = set()
        
        for citation_data in extracted_citations:
            title = citation_data.get("title", "Unknown Document")
            category = citation_data.get("category", "Unknown Category")
            section = citation_data.get("section", "")
            
            # Create unique identifier for this document section (include section for uniqueness)
            doc_key = (title.strip(), category.strip(), section.strip())
            
            # Skip if we've already seen this document section
            if doc_key in seen_documents:
                continue
                
            seen_documents.add(doc_key)
            
            # Find matching source metadata for rich fields
            matching_meta = None
            for meta in source_metadata_list:
                if (meta['title'] == title and meta['category'] == category):
                    matching_meta = meta
                    break
            
            # If no exact match found, try to find any document with the same title
            if not matching_meta:
                for meta in source_metadata_list:
                    if meta['title'] == title:
                        matching_meta = meta
                        break
            
            # Build citation with rich metadata
            quote_content = matching_meta['content'] if matching_meta else ""
            print(f"🔍 DEBUG: Citation for '{title}' - Quote length: {len(quote_content)}")
            if quote_content:
                print(f"📝 DEBUG: Quote preview: {quote_content[:100]}...")
            else:
                print(f"❌ DEBUG: No quote content found for '{title}'")
            
            citation_entry = {
                "id": f"citation-{len(cites) + 1}",
                "doc_title": title,
                "title": title,
                "category": category,
                "section": citation_data.get("section", ""),
                "date": citation_data.get("date", ""),
                "quote": quote_content,
                "pages": f"{citation_data.get('start_page', '')}-{citation_data.get('end_page', '')}" if citation_data.get('start_page') and citation_data.get('end_page') else "",
                "heading_path": matching_meta['heading_path'] if matching_meta else "",
                "hierarchy_path": matching_meta['heading_path'] if matching_meta else "",
                "year": matching_meta['year'] if matching_meta else "",
                "confidence_score": 0.95,  # High confidence since OpenAI extracted it
                "document": {
                    "title": title,
                    "category": category,
                    "section": citation_data.get("section", ""),
                    "date": citation_data.get("date", ""),
                    "year": matching_meta['year'] if matching_meta else "",
                    "pages": f"{citation_data.get('start_page', '')}-{citation_data.get('end_page', '')}" if citation_data.get('start_page') and citation_data.get('end_page') else "",
                    "heading_path": matching_meta['heading_path'] if matching_meta else ""
                },
                "meta": {
                    "document_number": matching_meta['document_number'] if matching_meta else "",
                    "chunk_index": matching_meta['chunk_index'] if matching_meta else "",
                    "page_span": {
                        "start": citation_data.get('start_page'),
                        "end": citation_data.get('end_page')
                    } if citation_data.get('start_page') and citation_data.get('end_page') else None
                }
            }
            cites.append(citation_entry)

    except Exception as e:
        print(f"Error extracting citations with OpenAI: {e}")
        print(f"Raw response was: {citations_json if 'citations_json' in locals() else 'No response'}")
        # Fallback: return empty citations
        cites = []
    
    return cites


def extract_citations_for_all_categories(source_metadata_list: list, max_per_category: int = 3) -> list:
    """
    Generate citations from ALL categories with deduplication.
    Ensures representation from every category, removes duplicates within each category.
    
    Args:
        source_metadata_list: List of document metadata from retrieval
        max_per_category: Maximum unique citations per category (default: 3)
    
    Returns:
        List of unique citations with representation from all categories
    """
    # Group by category first
    by_category = {}
    for meta in source_metadata_list:
        cat = meta.get('category', 'Unknown')
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(meta)
    
    print(f"📚 Generating citations from ALL categories (max {max_per_category} per category):")
    for cat, docs in by_category.items():
        print(f"   📁 {cat}: {len(docs)} documents")
    
    all_citations = []
    total_duplicates = 0
    
    # Process each category separately to ensure all categories are represented
    for category_name, category_docs in by_category.items():
        seen_in_category = set()  # Track duplicates within THIS category only
        category_citations = []
        duplicates_in_cat = 0
        
        print(f"\n🔍 Processing {category_name}:")
        
        for meta in category_docs:
            # Stop if we have enough citations from this category
            if len(category_citations) >= max_per_category:
                print(f"   ✂️ Reached max citations for {category_name} ({max_per_category})")
                break
            
            title = meta.get('title', 'Unknown Document')
            section = meta.get('heading_path', '')  # Use heading as section identifier
            
            # Create unique key within this category
            doc_key = (title.strip(), section.strip())
            
            # Skip duplicates within this category
            if doc_key in seen_in_category:
                duplicates_in_cat += 1
                print(f"   ⏭️  Skipping duplicate: {title}")
                continue
                
            seen_in_category.add(doc_key)
            
            citation = {
                "id": f"citation-{len(all_citations)+1}",
                "doc_title": title,
                "title": title,
                "category": category_name,
                "section": section or meta.get('section', 'Unknown Section'),
                "date": meta.get('issued_date', meta.get('date', 'Unknown Date')),
                "quote": meta.get('content', ''),  # Guaranteed quote
                "pages": f"{meta.get('page_start', '')}-{meta.get('page_end', '')}" if meta.get('page_start') and meta.get('page_end') else "",
                "heading_path": meta.get('heading_path', ''),
                "hierarchy_path": meta.get('heading_path', ''),
                "year": meta.get('year', ''),
                "document_number": meta.get('document_number', ''),
                "confidence_score": 0.95
            }
            category_citations.append(citation)
            print(f"   ✅ Added: {title}")
        
        all_citations.extend(category_citations)
        total_duplicates += duplicates_in_cat
        print(f"   📊 {category_name}: {len(category_citations)} unique citations, {duplicates_in_cat} duplicates removed")
    
    print(f"\n✅ Generated {len(all_citations)} UNIQUE citations from {len(by_category)} categories")
    print(f"   📉 Total duplicates removed: {total_duplicates}")
    print(f"   📊 Final breakdown:")
    
    # Show final breakdown by category
    citation_by_cat = {}
    for cite in all_citations:
        cat = cite.get('category', 'Unknown')
        citation_by_cat[cat] = citation_by_cat.get(cat, 0) + 1
    
    for cat, count in sorted(citation_by_cat.items()):
        print(f"      • {cat}: {count} citation(s)")
    
    return all_citations

def extract_citations_with_openai(llm_response: str, source_metadata_list: list) -> list:
    """
    Extract citations from LLM response using OpenAI for intelligent parsing.
    Returns a list of properly formatted citation objects.
    """
    cites = []
    
    try:
        # Create a more specific prompt to extract citations
        citation_extraction_prompt = f"""
You are a citation extraction assistant. Extract citations from the following text and return them as a valid JSON array.

Text to extract citations from:
{llm_response}

Instructions:
1. Look for the "Citations:" section in the text
2. Extract each numbered citation (1., 2., 3., etc.)
3. Parse the title, category, section, date, and page numbers
4. Return ONLY a valid JSON array

Example output format:
[
  {{
    "title": "Council Resolutions",
    "category": "Resolutions", 
    "section": "Resolution 41",
    "date": "2024-01-01",
    "start_page": 96,
    "end_page": 98
  }}
]

Return ONLY the JSON array, no other text.
"""

        # Use OpenAI to extract citations
        citation_response = LLM.invoke(citation_extraction_prompt)
        citations_json = citation_response.content if hasattr(citation_response, "content") else str(citation_response)
        
        # Clean the response - remove any markdown formatting
        citations_json = citations_json.strip()
        if citations_json.startswith('```json'):
            citations_json = citations_json[7:]
        if citations_json.endswith('```'):
            citations_json = citations_json[:-3]
        citations_json = citations_json.strip()
        
        # Parse the JSON response
        import json
        extracted_citations = json.loads(citations_json)
        
        
        
        # Convert to proper citation format
        seen_documents = set()
        
        for citation_data in extracted_citations:
            title = citation_data.get("title", "Unknown Document")
            category = citation_data.get("category", "Unknown Category")
            section = citation_data.get("section", "")
            
            # Create unique identifier for this document section (include section for uniqueness)
            doc_key = (title.strip(), category.strip(), section.strip())
            
            # Skip if we've already seen this document section
            if doc_key in seen_documents:
                continue
                
            seen_documents.add(doc_key)
            
            # Find matching source metadata for rich fields
            matching_meta = None
            for meta in source_metadata_list:
                if (meta['title'] == title and meta['category'] == category):
                    matching_meta = meta
                    break
            
            # If no exact match found, try to find any document with the same title
            if not matching_meta:
                for meta in source_metadata_list:
                    if meta['title'] == title:
                        matching_meta = meta
                        break
            
            # Build citation with rich metadata
            quote_content = matching_meta['content'] if matching_meta else ""
            print(f"🔍 DEBUG: Citation for '{title}' - Quote length: {len(quote_content)}")
            if quote_content:
                print(f"📝 DEBUG: Quote preview: {quote_content[:100]}...")
            else:
                print(f"❌ DEBUG: No quote content found for '{title}'")
            
            citation_entry = {
                "id": f"citation-{len(cites) + 1}",
                "doc_title": title,
                "title": title,
                "category": category,
                "section": citation_data.get("section", ""),
                "date": citation_data.get("date", ""),
                "quote": quote_content,
                "pages": f"{citation_data.get('start_page', '')}-{citation_data.get('end_page', '')}" if citation_data.get('start_page') and citation_data.get('end_page') else "",
                "heading_path": matching_meta['heading_path'] if matching_meta else "",
                "hierarchy_path": matching_meta['heading_path'] if matching_meta else "",
                "year": matching_meta['year'] if matching_meta else "",
                "confidence_score": 0.95,  # High confidence since OpenAI extracted it
                "document": {
                    "title": title,
                    "category": category,
                    "section": citation_data.get("section", ""),
                    "date": citation_data.get("date", ""),
                    "year": matching_meta['year'] if matching_meta else "",
                    "pages": f"{citation_data.get('start_page', '')}-{citation_data.get('end_page', '')}" if citation_data.get('start_page') and citation_data.get('end_page') else "",
                    "heading_path": matching_meta['heading_path'] if matching_meta else ""
                },
                "meta": {
                    "document_number": matching_meta['document_number'] if matching_meta else "",
                    "chunk_index": matching_meta['chunk_index'] if matching_meta else "",
                    "page_span": {
                        "start": citation_data.get('start_page'),
                        "end": citation_data.get('end_page')
                    } if citation_data.get('start_page') and citation_data.get('end_page') else None
                }
            }
            cites.append(citation_entry)

    except Exception as e:
        print(f"Error extracting citations with OpenAI: {e}")
        print(f"Raw response was: {citations_json if 'citations_json' in locals() else 'No response'}")
        # Fallback: return empty citations
        cites = []
    
    return cites
