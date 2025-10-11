"""
Document text extraction module.

Phase 1: Robust extraction for PDF (with selective OCR), DOCX, TXT/MD.
Handles mixed PDFs with both text and scanned pages intelligently.
"""

import re
import logging
from typing import Tuple, List, Dict, Optional
from pathlib import Path

# Import dependencies with fallback handling
try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    import pymupdf as fitz  # Alternative PDF library
except ImportError:
    fitz = None

try:
    from PIL import Image
    import pdf2image
except ImportError:
    Image = None
    pdf2image = None

try:
    import pytesseract
except ImportError:
    pytesseract = None

try:
    import docx
except ImportError:
    docx = None

logger = logging.getLogger(__name__)

# Constants for OCR decision making
MIN_MEANINGFUL_CHARS = 10  # Threshold for determining if page needs OCR
DEFAULT_DPI = 200  # Phase 2: Optimized DPI for quality vs memory balance
DEFAULT_OCR_LANGUAGE = "eng"


def extract_text_from_file(file_path: Path) -> Tuple[str, List[str]]:
    """
    Extract text content from various document formats.
    
    Phase 1: Comprehensive extraction with format detection.
    
    Args:
        file_path: Path to the document file
        
    Returns:
        Tuple of (full_text, page_texts) where page_texts is list of page strings
        
    Raises:
        ValueError: If file format is not supported
        FileNotFoundError: If file does not exist
    """
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    suffix = file_path.suffix.lower()
    
    if suffix == ".pdf":
        return extract_pdf(file_path)
    elif suffix == ".docx":
        return extract_docx(file_path)
    elif suffix in (".txt", ".md"):
        return extract_txt_md(file_path)
    else:
        raise ValueError(f"Unsupported file format: {suffix}")


def extract_pdf(file_path: Path, *, enable_ocr: bool = False, 
                ocr_language: str = DEFAULT_OCR_LANGUAGE, 
                dpi: int = DEFAULT_DPI, 
                ocr_threshold_chars: int = MIN_MEANINGFUL_CHARS) -> Tuple[str, List[str]]:
    """
    Extract text from PDF files with optional OCR for mixed content.
    
    Phase 1: Hard stop OCR control - OCR only when explicitly enabled.
    
    Args:
        file_path: Path to PDF file
        enable_ocr: Enable OCR processing (default: False - HARD STOP)
        ocr_language: Language for OCR (default: "eng")
        dpi: DPI for OCR rendering (default: 150)
        ocr_threshold_chars: Minimum chars before considering OCR (default: 10)
        
    Returns:
        Tuple of (full_text, page_texts) where page_texts is list of page strings
        
    Raises:
        ImportError: If required PDF libraries are not available
        Exception: For PDF processing errors
    """
    if not pdfplumber and not fitz:
        raise ImportError("PDF extraction requires pdfplumber or pymupdf. Install with: pip install pdfplumber pymupdf")
    
    logger.info(f"Extracting PDF: {file_path} (OCR enabled: {enable_ocr})")
    needs_ocr = set()
    page_texts = []
    
    try:
        # Phase 1: Extract text from all pages first
        with pdfplumber.open(str(file_path)) as pdf:
            for i, page in enumerate(pdf.pages):
                try:
                    # Extract text directly
                    txt = (page.extract_text() or "").strip()
                    page_texts.append(txt)
                    
                    # Only consider OCR if explicitly enabled
                    if enable_ocr:
                        meaningful_chars = sum(c.isalnum() for c in txt)
                        if meaningful_chars < ocr_threshold_chars:
                            needs_ocr.add(i)
                            logger.debug(f"Page {i+1} marked for OCR ({meaningful_chars} chars)")
                        else:
                            logger.debug(f"Page {i+1} has sufficient text ({meaningful_chars} chars)")
                    else:
                        logger.debug(f"Page {i+1} processed without OCR (OCR disabled)")
                        
                except Exception as page_error:
                    logger.warning(f"Error processing page {i+1}: {page_error}")
                    page_texts.append("")  # Add empty page to maintain numbering
        
        # Phase 2: Apply OCR only if enabled and needed
        if enable_ocr and needs_ocr:
            logger.info(f"Applying OCR to {len(needs_ocr)} pages: {sorted(needs_ocr)}")
            page_texts = _ocr_missing_pages(file_path, page_texts, needs_ocr, 
                                          ocr_language=ocr_language, dpi=dpi)
        elif needs_ocr:
            logger.info(f"OCR disabled - skipping {len(needs_ocr)} pages that might need OCR")
        else:
            logger.info("No pages require OCR - all pages have sufficient text")
        
        # Join pages with double newlines
        full_text = "\n\n".join(t for t in page_texts if t).strip()
        
        logger.info(f"Extracted {len(page_texts)} pages from PDF, total length: {len(full_text)} chars")
        return full_text, page_texts
        
    except Exception as e:
        logger.error(f"Error extracting PDF {file_path}: {e}")
        raise


def _ocr_missing_pages(file_path: Path, page_texts: List[str], needs_ocr: set, 
                      *, ocr_language: str = "eng", dpi: int = 200) -> List[str]:
    """
    Phase 2: Per-page OCR processing with immediate memory cleanup.
    Processes one page at a time and frees memory immediately to keep RAM flat.
    """
    if not needs_ocr:
        return page_texts
    
    import io
    import gc
    
    if not fitz:
        logger.warning("PyMuPDF not available for OCR - skipping OCR pages")
        return page_texts
        
    if not pytesseract or not Image:
        logger.warning("OCR libraries not available (pytesseract, PIL) - skipping OCR pages")
        return page_texts
    
    logger.info(f"Starting per-page OCR for {len(needs_ocr)} pages at {dpi} DPI (Phase 2: Memory optimized)")
    updated_page_texts = page_texts.copy()
    
    doc = fitz.open(str(file_path))
    try:
        mat = fitz.Matrix(dpi/72, dpi/72)  # Scale matrix for DPI
        
        for i in sorted(needs_ocr):
            if i >= len(doc):
                logger.warning(f"Page index {i} out of range, skipping")
                continue
                
            logger.debug(f"Processing page {i+1} with OCR...")
            
            # Load page and create pixmap
            page = doc.load_page(i)
            pix = page.get_pixmap(matrix=mat, alpha=False)  # No alpha channel to save memory
            
            try:
                # Convert to image bytes
                img_bytes = pix.tobytes("png")
                
                # Process with PIL and OCR
                with Image.open(io.BytesIO(img_bytes)) as im:
                    im.load()  # Load image data into memory
                    text = pytesseract.image_to_string(im, lang=ocr_language)
                    
            finally:
                # Immediate cleanup of pixmap
                del pix
            
            # Update page text if OCR produced better results
            ocr_text = (text or "").strip()
            if ocr_text and len(ocr_text) > len(updated_page_texts[i]):
                updated_page_texts[i] = ocr_text
                logger.debug(f"OCR improved page {i+1}: {len(ocr_text)} chars")
            else:
                logger.debug(f"OCR for page {i+1} didn't improve text quality")
            
            # Explicit cleanup and garbage collection
            del img_bytes, text, ocr_text
            gc.collect()  # Force garbage collection after each page
            
    except Exception as e:
        logger.error(f"OCR processing failed: {e}")
        # Return original page texts if OCR fails
        return page_texts
    finally:
        # Always close the document
        doc.close()
    
    logger.info(f"Completed OCR processing for {len(needs_ocr)} pages")
    return updated_page_texts


# Removed old OCR functions - now using unified approach in extract_pdf


# Phase 3: Streaming pipeline functions for memory optimization

def iter_clean_pages(pages_iter):
    """
    Phase 3: Page-by-page cleaning generator to avoid large aggregates.
    Processes pages one at a time without holding all pages in memory.
    """
    from ingestion.clean import clean_page_text
    
    for page in pages_iter:
        if not page or not page.strip():
            continue
        try:
            cleaned = clean_page_text(page)
            if cleaned and cleaned.strip():
                yield cleaned
        except Exception as e:
            logger.warning(f"Error cleaning page: {e}")
            # Yield original page if cleaning fails
            if page and page.strip():
                yield page


def iter_chunks(pages_iter, target_tokens: int = 1000, overlap: int = 200, 
                tokenize=None):
    """
    Phase 3: Generator-based chunking to avoid large memory aggregates.
    Processes pages into chunks without holding all text in memory.
    
    Args:
        pages_iter: Iterator of cleaned page texts
        target_tokens: Target tokens per chunk (default: 1000)
        overlap: Overlap tokens between chunks (default: 200)
        tokenize: Tokenization function (default: simple split)
    
    Yields:
        Text chunks as strings
    """
    if tokenize is None:
        tokenize = lambda s: s.split()
    
    buf = []
    
    for page in pages_iter:
        if not page or not page.strip():
            continue
            
        try:
            toks = tokenize(page)
            j = 0
            
            while j < len(toks):
                space = target_tokens - len(buf)
                if space <= 0:
                    # Buffer is full, yield chunk and reset with overlap
                    if buf:
                        yield " ".join(buf)
                        buf = buf[-overlap:] if len(buf) > overlap else []
                    space = target_tokens - len(buf)
                
                take = min(space, len(toks) - j)
                buf.extend(toks[j:j+take])
                j += take
                
                if len(buf) >= target_tokens:
                    yield " ".join(buf)
                    buf = buf[-overlap:] if len(buf) > overlap else []
                    
        except Exception as e:
            logger.warning(f"Error tokenizing page: {e}")
            continue
    
    # Yield final chunk if buffer has content
    if buf:
        yield " ".join(buf)


def process_pages_streaming(page_texts, target_tokens: int = 1000, 
                          overlap: int = 200, batch_size: int = 12):
    """
    Phase 3: Complete streaming pipeline for page processing.
    Combines cleaning, chunking, and batching without large aggregates.
    
    Args:
        page_texts: List or iterator of raw page texts
        target_tokens: Target tokens per chunk
        overlap: Overlap tokens between chunks
        batch_size: Batch size for processing
    
    Yields:
        Batches of processed chunks
    """
    # Create streaming pipeline
    pages_iter = iter_clean_pages(iter(page_texts))
    chunks_iter = iter_chunks(pages_iter, target_tokens, overlap)
    
    batch = []
    for chunk in chunks_iter:
        batch.append(chunk)
        if len(batch) >= batch_size:
            yield batch
            batch = []
    
    # Yield final batch if it has content
    if batch:
        yield batch


def extract_docx(file_path: Path) -> Tuple[str, List[str]]:
    """
    Extract text from DOCX files with paragraph-to-page mapping.
    
    Phase 1: DOCX extraction with pseudo-page structure.
    
    Args:
        file_path: Path to DOCX file
        
    Returns:
        Tuple of (full_text, page_texts) where each paragraph maps to a "page"
        
    Raises:
        ImportError: If python-docx is not available
        Exception: For DOCX processing errors
    """
    if not docx:
        raise ImportError("DOCX extraction requires python-docx. Install with: pip install python-docx")
    
    logger.info(f"Extracting DOCX: {file_path}")
    
    try:
        document = docx.Document(str(file_path))
        page_texts = []
        
        for para in document.paragraphs:
            text = para.text.strip()
            if text:  # Only include non-empty paragraphs
                page_texts.append(text)
        
        # Join paragraphs with double newlines
        full_text = "\n\n".join(page_texts).strip()
        
        logger.info(f"Extracted {len(page_texts)} paragraphs from DOCX, total length: {len(full_text)} chars")
        return full_text, page_texts
        
    except Exception as e:
        logger.error(f"Error extracting DOCX {file_path}: {e}")
        raise


def extract_txt_md(file_path: Path) -> Tuple[str, List[str]]:
    """
    Extract text from TXT/MD files with logical chunk splitting.
    
    Phase 1: Text extraction with smart section detection.
    
    Args:
        file_path: Path to TXT or MD file
        
    Returns:
        Tuple of (full_text, page_texts) where page_texts are logical sections
        
    Raises:
        Exception: For file reading errors
    """
    logger.info(f"Extracting TXT/MD: {file_path}")
    
    try:
        # Read file with UTF-8 encoding
        text = file_path.read_text(encoding="utf-8", errors="ignore")
        text = text.replace("\r\n", "\n")
        
        page_texts = []
        
        if file_path.suffix.lower() == ".md":
            # For Markdown, split by headers
            page_texts = _split_markdown_sections(text)
        else:
            # For plain text, split by blank lines or use simple chunks
            page_texts = _split_text_sections(text)
        
        # Ensure we have at least one section
        if not page_texts:
            page_texts = [text.strip()] if text.strip() else [""]
        
        # Full text is the original
        full_text = text.strip()
        
        logger.info(f"Extracted {len(page_texts)} sections from text file, total length: {len(full_text)} chars")
        return full_text, page_texts
        
    except Exception as e:
        logger.error(f"Error extracting text file {file_path}: {e}")
        raise


def _split_markdown_sections(text: str) -> List[str]:
    """Split Markdown text by headers."""
    # Split by lines starting with #
    sections = re.split(r'\n(?=#)', text)
    
    # Clean up sections
    cleaned_sections = []
    for section in sections:
        section = section.strip()
        if section:
            cleaned_sections.append(section)
    
    return cleaned_sections if cleaned_sections else [text.strip()]


def _split_text_sections(text: str) -> List[str]:
    """Split plain text by blank lines into logical sections."""
    # Split by multiple newlines (paragraph breaks)
    sections = re.split(r'\n\s*\n', text)
    
    # Clean up sections and group small ones
    cleaned_sections = []
    current_section = ""
    
    for section in sections:
        section = section.strip()
        if not section:
            continue
            
        # If section is very short, accumulate with next
        if len(section) < 100 and current_section:
            current_section += "\n\n" + section
        else:
            # Save previous accumulated section
            if current_section:
                cleaned_sections.append(current_section)
            current_section = section
    
    # Don't forget the last section
    if current_section:
        cleaned_sections.append(current_section)
    
    return cleaned_sections if cleaned_sections else [text.strip()]


# Add missing import for OCR functionality
try:
    import io
except ImportError:
    io = None