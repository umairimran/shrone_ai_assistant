"""
Document text cleaning and normalization module.

Phase 2: Gentle normalization that preserves legal symbols, removes headers/footers 
and page numbers, and normalizes whitespace.
"""

import re
from typing import List
from collections import Counter


def remove_repeated_headers_footers(page_texts: List[str]) -> List[str]:
    """
    Remove repeated headers and footers using frequency heuristic.
    
    Phase 2: Scan top/bottom lines across pages and remove frequently repeated ones.
    
    Args:
        page_texts: List of page text strings
        
    Returns:
        List of cleaned page texts with headers/footers removed
    """
    if not page_texts or len(page_texts) < 2:
        return page_texts
    
    # Number of lines to check at top/bottom of each page
    SAMPLE_LINES = 2  # Reduced to avoid overlap in short pages
    
    # Collect candidates for header/footer lines
    candidates = Counter()
    page_lines = []
    
    for page_text in page_texts:
        lines = [line.strip() for line in page_text.splitlines() if line.strip()]
        page_lines.append(lines)
        
        if lines:
            # For short pages, be more conservative
            if len(lines) <= 4:
                # Only check first and last line for very short pages
                if lines:
                    candidates[lines[0]] += 1
                if len(lines) > 1:
                    candidates[lines[-1]] += 1
            else:
                # Check top lines (headers)
                top_lines = lines[:SAMPLE_LINES]
                # Check bottom lines (footers), but avoid overlap with top
                bottom_start = max(SAMPLE_LINES, len(lines) - SAMPLE_LINES)
                bottom_lines = lines[bottom_start:]
                
                # Add to candidates if line is short enough to be header/footer
                for line in top_lines + bottom_lines:
                    if len(line) < 200:  # Reasonable header/footer length
                        candidates[line] += 1
    
    # Determine threshold - line must appear in at least 1/3 of pages
    threshold = max(2, len(page_texts) // 3)
    repeated_lines = {line for line, count in candidates.items() if count >= threshold}
    
    # Remove repeated lines from each page
    cleaned_pages = []
    for lines in page_lines:
        cleaned_lines = [line for line in lines if line not in repeated_lines]
        cleaned_pages.append('\n'.join(cleaned_lines))
    
    return cleaned_pages


def clean_page_text(text: str) -> str:
    """
    Clean individual page text while preserving legal symbols.
    
    Phase 2: Remove page numbers, de-hyphenate line breaks, normalize whitespace.
    Preserves legal symbols like §, quotes, bullets, etc.
    
    Args:
        text: Raw page text
        
    Returns:
        Cleaned page text with legal symbols preserved
    """
    if not text:
        return ""
    
    # Page number patterns to remove
    page_patterns = [
        r'^\s*\d+\s*$',                    # standalone numbers
        r'^\s*Page\s+\d+\s*$',             # "Page 1"
        r'^\s*Page\s+\d+\s+of\s+\d+\s*$',  # "Page 1 of 10"
        r'^\s*\d+\s+of\s+\d+\s*$',         # "1 of 10"
        r'^\s*-\s*\d+\s*-\s*$',            # "- 1 -"
        r'^\s*\|\s*\d+\s*\|\s*$',          # "| 1 |"
        r'^\s*\[\s*\d+\s*\]\s*$',          # "[ 1 ]"
    ]
    
    # Split into lines for processing
    lines = text.split('\n')
    cleaned_lines = []
    
    for line in lines:
        # Check if line matches page number pattern
        is_page_number = any(re.match(pattern, line, re.IGNORECASE) for pattern in page_patterns)
        
        if not is_page_number and line.strip():
            cleaned_lines.append(line)
    
    # Rejoin lines
    text = '\n'.join(cleaned_lines)
    
    # De-hyphenate line breaks: "word-\nword" -> "wordword"  
    text = re.sub(r'(\w)-\s*\n\s*(\w)', r'\1\2', text)
    
    # Normalize line endings
    text = re.sub(r'\r\n', '\n', text)
    
    # Reduce multiple newlines to double newlines (preserve paragraph breaks)
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Normalize spaces (multiple spaces to single space)
    text = re.sub(r'[ \t]+', ' ', text)
    
    # Clean up space at line endings/beginnings but preserve structure
    text = re.sub(r' +\n', '\n', text)
    text = re.sub(r'\n +', '\n', text)
    
    return text.strip()


def normalize_pages(pages: List[str]) -> List[str]:
    """
    Apply both header/footer removal and page text cleaning.
    
    Phase 2: Complete page normalization pipeline.
    
    Args:
        pages: List of raw page texts
        
    Returns:
        List of normalized page texts
    """
    # First remove repeated headers/footers
    cleaned_pages = remove_repeated_headers_footers(pages)
    
    # Then clean each page individually
    normalized_pages = [clean_page_text(page) for page in cleaned_pages]
    
    return normalized_pages


def join_pages(pages: List[str]) -> str:
    """
    Join cleaned pages with double newlines.
    
    Phase 2: Simple page joining for full document text.
    
    Args:
        pages: List of cleaned page texts
        
    Returns:
        Full document text with pages joined by "\n\n"
    """
    return '\n\n'.join(page for page in pages if page.strip())


def filter_table_of_contents(text: str) -> str:
    """
    Filter out table of contents entries using regex patterns.
    
    Removes lines that look like:
    - "Article I ................................. 1"
    - "Section 1.1 Introduction ............ 5"
    - "Chapter 2: Overview .............. 12"
    
    Args:
        text: Document text potentially containing TOC entries
        
    Returns:
        Text with TOC entries removed
    """
    if not text:
        return ""
    
    lines = text.split('\n')
    filtered_lines = []
    
    # TOC patterns to filter out
    toc_patterns = [
        r'^[A-Za-z0-9\s\.\-:]+\.{3,}\s*\d+\s*$',  # "Title ........ 5"
        r'^[A-Za-z0-9\s]+\s+\.{3,}\s*\d+\s*$',    # "Title  ....... 5"
        r'^\s*[A-Za-z0-9\.\s\-:]+\s+\d+\s*$',     # "Section 1.1 Title  5"
        r'^\s*[IVX]+\.\s+[A-Za-z0-9\s\-:]+\.{2,}\s*\d+',  # "I. Title .... 5"
        r'^\s*\d+\.\s+[A-Za-z0-9\s\-:]+\.{2,}\s*\d+',     # "1. Title .... 5"
    ]
    
    for line in lines:
        # Skip if line matches TOC patterns
        is_toc = any(re.match(pattern, line.strip()) for pattern in toc_patterns)
        
        if not is_toc:
            filtered_lines.append(line)
    
    return '\n'.join(filtered_lines)