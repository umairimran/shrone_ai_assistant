"""
Document metadata inference module.

Phase 3: Intelligent metadata extraction from document content.
"""

import re
from datetime import datetime
from typing import Optional, List, Dict, Any

from .schemas import CATEGORIES


def infer_title(text: str, max_length: int = 200) -> str:
    """
    Infer document title from text content.
    
    Phase 3: Extract document titles using regex patterns for ACEP documents.
    
    Args:
        text: Document text content
        max_length: Maximum title length (default: 200)
        
    Returns:
        Inferred title string
    """
    if not text:  # Safety check for None or empty text
        return ""
    
    lines = text.split('\n')
    
    # Patterns for ACEP document titles
    title_patterns = [
        # Policy statements and position papers
        r'^ACEP\s+Policy\s+Statement:?\s*(.+)',
        r'^ACEP\s+Position\s+Statement:?\s*(.+)', 
        r'^Policy\s+Statement:?\s*(.+)',
        r'^Position\s+Statement:?\s*(.+)',
        
        # Board meeting materials
        r'^Board\s+of\s+Directors?\s+Meeting\s+(.+)',
        r'^BOD\s+Meeting\s+(.+)',
        r'^Executive\s+Committee\s+(.+)',
        r'^Special\s+BOD\s+(.+)',
        
        # Resolutions
        r'^Resolution\s+(\d+[A-Z]?[-\d]*):?\s*(.+)',
        r'^ACEP\s+Resolution\s+(.+)',
        
        # Bylaws and governance
        r'^ACEP\s+Bylaws\s*(.+)',
        r'^Bylaws\s+(.+)',
        r'^Governance\s+Policy:?\s*(.+)',
        
        # External communications
        r'^ACEP\s+(?:Announces|Statement|Response|Endorses|Reaffirms)\s+(.+)',
        r'^Emergency\s+Physicians?\s+(.+)',
        r'^Leading\s+Physician\s+Organizations\s+(.+)',
    ]
    
    # Search for title patterns in first 10 lines
    for i, line in enumerate(lines[:10]):
        line = line.strip()
        if not line:
            continue
            
        for pattern in title_patterns:
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                if len(match.groups()) == 2:
                    # Pattern with resolution number and title
                    title = f"Resolution {match.group(1)}: {match.group(2)}"
                else:
                    # Single captured group
                    title = match.group(1)
                
                title = _clean_title(title, max_length)
                if title:
                    return title
    
    # Fallback: Look for lines that look like titles
    for i, line in enumerate(lines[:5]):
        line = line.strip()
        if not line:
            continue
            
        # Skip common headers/footers
        if _is_likely_header_footer(line):
            continue
            
        # Look for title-like characteristics
        if _is_likely_title(line):
            title = _clean_title(line, max_length)
            if title:
                return title
    
    # Ultimate fallback: First non-empty line
    for line in lines[:10]:
        line = line.strip()
        if line and not _is_likely_header_footer(line):
            title = _clean_title(line, max_length)
            if title:
                return title
    
    return "Untitled Document"


def infer_document_number(text: str) -> Optional[str]:
    """
    Infer document number or identifier from text content.
    
    Phase 3: Extract document numbers, codes, or identifiers.
    
    Args:
        text: Document text content
        
    Returns:
        Document number/identifier string or None
    """
    if not text:  # Safety check for None or empty text
        return None
        
    lines = text.split('\n')
    
    # Patterns for document numbers/identifiers
    number_patterns = [
        # Resolution numbers
        r'Resolution\s+(\d+[A-Z]?[-\d]*)',
        r'Res\.\s+(\d+[A-Z]?[-\d]*)',
        r'Resolution\s+No\.\s+(\d+[A-Z]?[-\d]*)',
        
        # Policy numbers
        r'Policy\s+(?:Number|No\.?|#)\s*:?\s*([A-Z0-9.-]+)',
        r'Policy\s+([A-Z0-9.-]{3,})',
        
        # Document codes
        r'Document\s+(?:Number|No\.?|Code|ID)\s*:?\s*([A-Z0-9.-]+)',
        r'Doc\s+(?:No\.?|#)\s*:?\s*([A-Z0-9.-]+)',
        
        # Meeting numbers/dates as identifiers
        r'Meeting\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
        r'(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+Meeting',
        
        # General alphanumeric codes
        r'([A-Z]{2,}\d{2,})',  # Letters followed by numbers
        r'(\d{2,}[A-Z]{2,})',  # Numbers followed by letters
    ]
    
    # Search in first 20 lines for document numbers
    for line in lines[:20]:
        line = line.strip()
        if not line:
            continue
            
        for pattern in number_patterns:
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                doc_number = match.group(1).strip()
                if len(doc_number) >= 2:  # Minimum meaningful length
                    return doc_number
    
    return None


def infer_issued_date(text: str) -> Optional[str]:
    """
    Infer and normalize document issue date to ISO format.
    
    Phase 3: Extract dates and normalize to YYYY-MM-DD format.
    
    Args:
        text: Document text content
        
    Returns:
        ISO formatted date string (YYYY-MM-DD) or None
    """
    if not text:  # Safety check for None or empty text
        return None
        
    lines = text.split('\n')
    
    # Common date patterns
    date_patterns = [
        # Full dates with various separators
        r'(\d{1,2})[-/](\d{1,2})[-/](\d{4})',           # MM/DD/YYYY or DD/MM/YYYY
        r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})',           # YYYY/MM/DD
        r'(\d{1,2})[-/](\d{1,2})[-/](\d{2})',           # MM/DD/YY
        
        # Month names
        r'(\w+)\s+(\d{1,2}),?\s+(\d{4})',               # January 15, 2024
        r'(\d{1,2})\s+(\w+)\s+(\d{4})',                 # 15 January 2024
        r'(\w+)\s+(\d{4})',                             # January 2024
        
        # Specific contexts
        r'(?:Issued|Adopted|Approved|Effective)\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4})',
        r'(?:Date|Meeting)\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
    ]
    
    # Month name mapping
    month_names = {
        'january': 1, 'jan': 1, 'february': 2, 'feb': 2, 'march': 3, 'mar': 3,
        'april': 4, 'apr': 4, 'may': 5, 'june': 6, 'jun': 6, 'july': 7, 'jul': 7,
        'august': 8, 'aug': 8, 'september': 9, 'sep': 9, 'sept': 9, 'october': 10,
        'oct': 10, 'november': 11, 'nov': 11, 'december': 12, 'dec': 12
    }
    
    # Search for dates in first 30 lines
    for line in lines[:30]:
        line = line.strip()
        if not line:
            continue
            
        for pattern in date_patterns:
            matches = re.finditer(pattern, line, re.IGNORECASE)
            for match in matches:
                try:
                    groups = match.groups()
                    
                    if len(groups) == 1:
                        # Single group - try to parse as full date string
                        date_str = groups[0]
                        parsed_date = _parse_date_string(date_str, month_names)
                        if parsed_date:
                            return parsed_date
                    
                    elif len(groups) == 2:
                        # Month and year
                        month_str, year_str = groups
                        month = month_names.get(month_str.lower())
                        if month and year_str.isdigit():
                            year = int(year_str)
                            if 1900 <= year <= 2100:
                                return f"{year:04d}-{month:02d}-01"
                    
                    elif len(groups) == 3:
                        # Three components - figure out the format
                        parsed_date = _parse_three_component_date(groups, month_names)
                        if parsed_date:
                            return parsed_date
                            
                except (ValueError, TypeError):
                    continue
    
    return None


def derive_year(text: str, issued_date: Optional[str] = None) -> Optional[int]:
    """
    Derive year from document content or issued date.
    
    Phase 3: Extract year for metadata.
    
    Args:
        text: Document text content
        issued_date: ISO formatted date string if available
        
    Returns:
        Year as integer or None
    """
    # First try to get year from issued_date
    if issued_date:
        try:
            return int(issued_date[:4])
        except (ValueError, TypeError):
            pass
    
    # Look for years in text content
    if not text:  # Safety check for None or empty text
        return None
        
    year_patterns = [
        r'\b(20[0-4]\d)\b',  # Years 2000-2049
        r'\b(19[7-9]\d)\b',  # Years 1970-1999
    ]
    
    current_year = datetime.now().year
    found_years = []
    
    lines = text.split('\n')
    for line in lines[:20]:  # Check first 20 lines
        for pattern in year_patterns:
            matches = re.finditer(pattern, line)
            for match in matches:
                year = int(match.group(1))
                if 1970 <= year <= current_year + 5:  # Reasonable year range
                    found_years.append(year)
    
    if found_years:
        # Return the most recent reasonable year
        return max(found_years)
    
    return None


def validate_category(category: str) -> str:
    """
    Validate and normalize document category.
    
    Phase 3: Ensure category matches ACEP schema.
    
    Args:
        category: Category string to validate
        
    Returns:
        Validated category from CATEGORIES or default
    """
    if not category:
        return "External Advocacy &  Communications"  # Default category
    
    # Direct match
    if category in CATEGORIES:
        return category
    
    # Fuzzy matching for common variations
    category_lower = category.lower()
    
    category_mapping = {
        'resolution': 'Resolutions',
        'resolutions': 'Resolutions',
        'policy': 'Policy & Position Statements',
        'position': 'Policy & Position Statements',
        'statement': 'Policy & Position Statements',
        'bylaws': 'Bylaws & Governance Policies',
        'governance': 'Bylaws & Governance Policies',
        'board': 'Board & Committee Proceedings',
        'committee': 'Board & Committee Proceedings',
        'meeting': 'Board & Committee Proceedings',
        'bod': 'Board & Committee Proceedings',
        'external': 'External Advocacy & Communications',
        'advocacy': 'External Advocacy & Communications',
        'communication': 'External Advocacy & Communications',
        'announcement': 'External Advocacy & Communications',
    }
    
    # Check for partial matches
    for key, value in category_mapping.items():
        if key in category_lower:
            return value
    
    # Default fallback
    return "External Advocacy & Communications"


# Helper functions

def _clean_title(title: str, max_length: int) -> str:
    """Clean and normalize title string."""
    if not title:
        return ""
    
    # Remove common artifacts
    title = re.sub(r'^[^\w]*', '', title)  # Remove leading non-word chars
    title = re.sub(r'[^\w]*$', '', title)  # Remove trailing non-word chars
    title = re.sub(r'\s+', ' ', title)     # Normalize whitespace
    title = title.strip()
    
    # Truncate if too long
    if len(title) > max_length:
        title = title[:max_length].rsplit(' ', 1)[0] + "..."
    
    return title


def _is_likely_header_footer(line: str) -> bool:
    """Check if line is likely a header/footer."""
    line_lower = line.lower()
    
    # Common header/footer patterns
    header_footer_indicators = [
        'page', 'confidential', 'draft', 'acep.org', 'american college',
        'copyright', '©', 'all rights reserved', 'printed'
    ]
    
    return any(indicator in line_lower for indicator in header_footer_indicators)


def _is_likely_title(line: str) -> bool:
    """Check if line has title-like characteristics."""
    # Title characteristics
    if len(line) < 10 or len(line) > 200:
        return False
    
    # Should have reasonable word count
    words = line.split()
    if len(words) < 2 or len(words) > 30:
        return False
    
    # Should not end with comma (likely continuation)
    if line.endswith(','):
        return False
    
    # Should have some capitalization
    capital_ratio = sum(1 for c in line if c.isupper()) / len(line)
    if capital_ratio < 0.1:  # At least 10% capitals
        return False
    
    return True


def _parse_date_string(date_str: str, month_names: Dict[str, int]) -> Optional[str]:
    """Parse a full date string."""
    # Try common formats
    date_str = date_str.strip()
    
    # Month Day, Year format
    match = re.match(r'(\w+)\s+(\d{1,2}),?\s+(\d{4})', date_str, re.IGNORECASE)
    if match:
        month_str, day_str, year_str = match.groups()
        month = month_names.get(month_str.lower())
        if month:
            try:
                day = int(day_str)
                year = int(year_str)
                if 1 <= day <= 31 and 1900 <= year <= 2100:
                    return f"{year:04d}-{month:02d}-{day:02d}"
            except ValueError:
                pass
    
    return None


def _parse_three_component_date(groups: tuple, month_names: Dict[str, int]) -> Optional[str]:
    """Parse date with three components."""
    comp1, comp2, comp3 = groups
    
    # Try different interpretations
    interpretations = [
        # MM/DD/YYYY
        (comp1, comp2, comp3, 'mdy'),
        # DD/MM/YYYY  
        (comp2, comp1, comp3, 'dmy'),
        # YYYY/MM/DD
        (comp3, comp2, comp1, 'ymd') if comp1.isdigit() and len(comp1) == 4 else None,
        # Month Day Year
        (month_names.get(comp1.lower()), comp2, comp3, 'mdy') if comp1.isalpha() else None,
        # Day Month Year
        (month_names.get(comp2.lower()), comp1, comp3, 'dmy') if comp2.isalpha() else None,
    ]
    
    for interpretation in interpretations:
        if interpretation is None:
            continue
            
        try:
            if interpretation[3] == 'ymd':
                year, month, day = int(interpretation[2]), int(interpretation[1]), int(interpretation[0])
            else:
                month, day, year = interpretation[0], int(interpretation[1]), int(interpretation[2])
                
                if isinstance(month, str):
                    continue  # Skip if month parsing failed
            
            # Handle 2-digit years
            if year < 100:
                if year > 50:
                    year += 1900
                else:
                    year += 2000
            
            # Validate ranges
            if 1 <= month <= 12 and 1 <= day <= 31 and 1900 <= year <= 2100:
                return f"{year:04d}-{month:02d}-{day:02d}"
                
        except (ValueError, TypeError):
            continue
    
    return None

from typing import Optional, Dict
from pathlib import Path
from .schemas import DocumentMeta, CATEGORIES


def extract_document_metadata(file_path: Path, text: str = "") -> DocumentMeta:
    """
    Extract metadata from document file and content.
    
    Phase 0: Placeholder for metadata extraction logic.
    
    Args:
        file_path: Path to the document file
        text: Document text content for analysis
        
    Returns:
        DocumentMeta object with extracted metadata
        
    Raises:
        NotImplementedError: Placeholder for Phase 0
    """
    raise NotImplementedError("Metadata extraction will be implemented in future phases")


def detect_document_category(title: str, text: str = "") -> str:
    """
    Detect document category from title and content.
    
    Phase 0: Returns first category as placeholder.
    
    Args:
        title: Document title
        text: Document content
        
    Returns:
        One of the 5 valid categories
    """
    # Phase 0: Return first valid category as placeholder
    return next(iter(CATEGORIES))


def extract_document_date(title: str, text: str = "") -> Optional[str]:
    """Extract document date in ISO format."""
    raise NotImplementedError("Date extraction will be implemented in future phases")


def extract_document_number(title: str, text: str = "") -> Optional[str]:
    """Extract document number from title or content."""
    raise NotImplementedError("Document number extraction will be implemented in future phases")


def determine_document_year(date_str: Optional[str] = None, title: str = "") -> Optional[int]:
    """Determine document year from date or title."""
    raise NotImplementedError("Year extraction will be implemented in future phases")