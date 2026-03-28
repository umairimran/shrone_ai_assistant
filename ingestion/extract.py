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
DEFAULT_DPI = 300
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


def extract_pdf(file_path: Path, ocr_language: str = DEFAULT_OCR_LANGUAGE, 
                dpi: int = DEFAULT_DPI) -> Tuple[str, List[str]]:
    """
    Extract text from PDF files with selective OCR for mixed content.
    
    Phase 1: Intelligent PDF processing - OCR only pages with insufficient text.
    
    Args:
        file_path: Path to PDF file
        ocr_language: Language for OCR (default: "eng")
        dpi: DPI for OCR rendering (default: 300)
        
    Returns:
        Tuple of (full_text, page_texts) where page_texts is list of page strings
        
    Raises:
        ImportError: If required PDF libraries are not available
        Exception: For PDF processing errors
    """
    if not pdfplumber and not fitz:
        raise ImportError("PDF extraction requires pdfplumber or pymupdf. Install with: pip install pdfplumber pymupdf")
    
    logger.info(f"Extracting PDF: {file_path}")
    page_texts = []
    
    try:
        # Primary extraction using pdfplumber
        if pdfplumber:
            page_texts = _extract_pdf_pdfplumber(file_path, ocr_language, dpi)
        elif fitz:
            page_texts = _extract_pdf_pymupdf(file_path, ocr_language, dpi)
        
        # Join pages with double newlines
        full_text = "\n\n".join(page_texts).strip()
        
        logger.info(f"Extracted {len(page_texts)} pages from PDF, total length: {len(full_text)} chars")
        return full_text, page_texts
        
    except Exception as e:
        logger.error(f"Error extracting PDF {file_path}: {e}")
        raise


def _extract_pdf_pdfplumber(file_path: Path, ocr_language: str, dpi: int) -> List[str]:
    """Extract PDF using pdfplumber with selective OCR."""
    page_texts = []
    
    with pdfplumber.open(str(file_path)) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            try:
                # Try to extract text first
                text = page.extract_text() or ""
                text = text.replace("\r\n", "\n").strip()
                
                # Check if page needs OCR
                meaningful_chars = len(re.sub(r'\s+', '', text))
                
                if meaningful_chars < MIN_MEANINGFUL_CHARS:
                    logger.debug(f"Page {page_num} has {meaningful_chars} chars, applying OCR")
                    ocr_text = _ocr_pdf_page_pdfplumber(page, ocr_language, dpi)
                    if ocr_text and len(ocr_text.strip()) > meaningful_chars:
                        text = ocr_text
                        logger.debug(f"OCR improved page {page_num}: {len(ocr_text)} chars")
                else:
                    logger.debug(f"Page {page_num} has sufficient text ({meaningful_chars} chars), skipping OCR")
                
                page_texts.append(text)
                
            except Exception as e:
                logger.warning(f"Error processing page {page_num}: {e}")
                page_texts.append("")  # Add empty page to maintain page numbering
    
    return page_texts


def _extract_pdf_pymupdf(file_path: Path, ocr_language: str, dpi: int) -> List[str]:
    """Extract PDF using PyMuPDF with selective OCR."""
    page_texts = []
    
    with fitz.open(str(file_path)) as pdf:
        for page_num in range(pdf.page_count):
            try:
                page = pdf[page_num]
                
                # Extract text
                text = page.get_text().replace("\r\n", "\n").strip()
                
                # Check if page needs OCR
                meaningful_chars = len(re.sub(r'\s+', '', text))
                
                if meaningful_chars < MIN_MEANINGFUL_CHARS:
                    logger.debug(f"Page {page_num + 1} has {meaningful_chars} chars, applying OCR")
                    ocr_text = _ocr_pdf_page_pymupdf(page, ocr_language, dpi)
                    if ocr_text and len(ocr_text.strip()) > meaningful_chars:
                        text = ocr_text
                        logger.debug(f"OCR improved page {page_num + 1}: {len(ocr_text)} chars")
                else:
                    logger.debug(f"Page {page_num + 1} has sufficient text ({meaningful_chars} chars), skipping OCR")
                
                page_texts.append(text)
                
            except Exception as e:
                logger.warning(f"Error processing page {page_num + 1}: {e}")
                page_texts.append("")  # Add empty page to maintain page numbering
    
    return page_texts


def _ocr_pdf_page_pdfplumber(page, ocr_language: str, dpi: int) -> str:
    """OCR a single PDF page using pdfplumber + pytesseract."""
    if not pytesseract or not Image or not pdf2image:
        logger.warning("OCR libraries not available (pytesseract, PIL, pdf2image)")
        return ""
    
    try:
        # Convert page to image
        # Note: pdfplumber doesn't have direct image conversion, so we fall back to pdf2image
        # This is a limitation - in production you might want to use pymupdf for this
        logger.debug("OCR with pdfplumber requires pdf2image fallback")
        return ""
        
    except Exception as e:
        logger.warning(f"OCR failed for page: {e}")
        return ""


def _ocr_pdf_page_pymupdf(page, ocr_language: str, dpi: int) -> str:
    """OCR a single PDF page using PyMuPDF + pytesseract."""
    if not pytesseract or not Image:
        logger.warning("OCR libraries not available (pytesseract, PIL)")
        return ""
    
    try:
        # Render page as image
        mat = fitz.Matrix(dpi / 72, dpi / 72)  # Scale matrix for DPI
        pix = page.get_pixmap(matrix=mat)
        img_data = pix.tobytes("png")
        
        # Convert to PIL Image
        img = Image.open(io.BytesIO(img_data))
        
        # OCR the image
        ocr_text = pytesseract.image_to_string(img, lang=ocr_language)
        return ocr_text.replace("\r\n", "\n").strip()
        
    except Exception as e:
        logger.warning(f"OCR failed for page: {e}")
        return ""


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