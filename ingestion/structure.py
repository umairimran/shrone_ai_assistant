"""
Document structure analysis and heading extraction module.

Phase 2: Detect basic headings to form blocks using Article/Section/Resolution patterns.
"""

import re
from typing import List, Dict, Tuple, Optional


def split_into_blocks(cleaned_pages: List[str]) -> List[Dict]:
    """
    Split cleaned pages into blocks based on heading detection.
    
    Phase 2: Scan line-by-line for Article/Section/Resolution headings.
    Start new block on heading match, close previous block.
    
    Args:
        cleaned_pages: List of cleaned page text strings
        
    Returns:
        List of block dictionaries with keys:
        - text: str (block content)
        - page_start: int (starting page number, 1-based)
        - page_end: int (ending page number, 1-based)  
        - heading_path: list[str] (array with heading line)
    """
    if not cleaned_pages:
        return []
    
    # Heading patterns for ACEP documents
    heading_patterns = [
        r'^Article\s+[IVXLC]+',                    # Article I, Article II, etc.
        r'^Section\s+\d+(\.\d+)*',                 # Section 1, Section 1.1, etc.
        r'^Resolution\s*(No\.?)?\s*\d+',           # Resolution 1, Resolution No. 1, etc.
    ]
    
    # Compile patterns for efficiency
    compiled_patterns = [re.compile(pattern, re.IGNORECASE) for pattern in heading_patterns]
    
    blocks = []
    current_block = None
    
    for page_num, page_text in enumerate(cleaned_pages, 1):
        if not page_text.strip():
            continue
            
        lines = page_text.split('\n')
        
        for line in lines:
            line_stripped = line.strip()
            if not line_stripped:
                continue
                
            # Check if line matches any heading pattern
            heading_match = None
            for pattern in compiled_patterns:
                if pattern.match(line_stripped):
                    heading_match = line_stripped
                    break
            
            if heading_match:
                # Close previous block if exists
                if current_block is not None:
                    # Ensure page_end is never less than page_start
                    current_block['page_end'] = max(page_num - 1, current_block['page_start'])
                    current_block['text'] = current_block['text'].strip()
                    if current_block['text']:  # Only add non-empty blocks
                        blocks.append(current_block)
                
                # Start new block
                current_block = {
                    'text': line + '\n',
                    'page_start': page_num,
                    'page_end': page_num,  # Will be updated when block closes
                    'heading_path': [heading_match]
                }
            else:
                # Add line to current block
                if current_block is not None:
                    current_block['text'] += line + '\n'
                    current_block['page_end'] = page_num
                else:
                    # No heading found yet, start a default block
                    current_block = {
                        'text': line + '\n',
                        'page_start': page_num,
                        'page_end': page_num,
                        'heading_path': []
                    }
    
    # Don't forget the last block
    if current_block is not None:
        current_block['text'] = current_block['text'].strip()
        if current_block['text']:  # Only add non-empty blocks
            blocks.append(current_block)
    
    return blocks


def analyze_document_structure(text: str) -> Dict:
    """
    Analyze document structure and extract heading hierarchy.
    
    Phase 2: Basic implementation using split_into_blocks.
    
    Args:
        text: Cleaned document text
        
    Returns:
        Dictionary containing document structure information
    """
    # Split text back into pseudo-pages for block analysis
    pages = text.split('\n\n') if text else []
    blocks = split_into_blocks(pages)
    
    return {
        'total_blocks': len(blocks),
        'blocks': blocks,
        'has_articles': any('Article' in block.get('heading_path', []) for block in blocks),
        'has_sections': any('Section' in str(block.get('heading_path', [])) for block in blocks),
        'has_resolutions': any('Resolution' in str(block.get('heading_path', [])) for block in blocks)
    }


def extract_headings(text: str) -> List[Dict]:
    """
    Extract document headings and their hierarchy.
    
    Phase 2: Extract headings from identified blocks.
    
    Args:
        text: Document text
        
    Returns:
        List of heading dictionaries
    """
    structure = analyze_document_structure(text)
    headings = []
    
    for block in structure['blocks']:
        if block.get('heading_path'):
            headings.append({
                'text': block['heading_path'][0],
                'page_start': block['page_start'],
                'page_end': block['page_end'],
                'level': _determine_heading_level(block['heading_path'][0])
            })
    
    return headings


def _determine_heading_level(heading: str) -> int:
    """Determine heading level based on pattern."""
    if re.match(r'^Article\s+[IVXLC]+', heading, re.IGNORECASE):
        return 1  # Top level
    elif re.match(r'^Section\s+\d+(\.\d+)*', heading, re.IGNORECASE):
        # Count dots to determine nesting level
        dots = heading.count('.')
        return 2 + dots
    elif re.match(r'^Resolution\s*(No\.?)?\s*\d+', heading, re.IGNORECASE):
        return 1  # Top level
    else:
        return 3  # Default level


def detect_sections(text: str) -> List[Tuple[str, int, int]]:
    """
    Detect document sections with start/end positions.
    
    Phase 2: Use block-based detection.
    
    Args:
        text: Document text
        
    Returns:
        List of tuples (section_title, start_pos, end_pos)
    """
    structure = analyze_document_structure(text)
    sections = []
    
    current_pos = 0
    for block in structure['blocks']:
        block_text = block['text']
        start_pos = current_pos
        end_pos = current_pos + len(block_text)
        
        section_title = 'Untitled Section'
        if block.get('heading_path'):
            section_title = block['heading_path'][0]
        
        sections.append((section_title, start_pos, end_pos))
        current_pos = end_pos
    
    return sections


def build_heading_path(position: int, headings: List[Dict]) -> List[str]:
    """
    Build hierarchical heading path for a given text position.
    
    Phase 2: Simple implementation based on position.
    
    Args:
        position: Character position in document
        headings: List of heading dictionaries
        
    Returns:
        List of heading strings forming path to position
    """
    # This is a simplified implementation for Phase 2
    # In practice, you'd need character-level position tracking
    path = []
    
    # Find headings that could contain this position
    for heading in headings:
        # Approximate based on page numbers
        if heading.get('page_start', 0) <= position:
            path.append(heading['text'])
    
    return path