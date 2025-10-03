"""
Pydantic schemas for ACEP document processing with strict category validation.

Phase 0: Core data models with strict category enum validation.
"""

from typing import List, Optional
from pydantic import BaseModel, Field, validator

# Exact 5 categories as specified - matching actual folder names
CATEGORIES = {
    "Resolutions",
    "By-Laws & Governance Policies", 
    "Board and Committee Proceedings",
    "Policy & Position Statements",
    "External Advocacy &  Communications"
}


def validate_category(category: str) -> str:
    """
    Strict category validator - raises ValueError if not one of the 5 exact values.
    
    Args:
        category: Category string to validate
        
    Returns:
        The validated category string
        
    Raises:
        ValueError: If category is not one of the 5 exact values
    """
    if category not in CATEGORIES:
        valid_categories = ", ".join(sorted(CATEGORIES))
        raise ValueError(
            f"Category '{category}' is not valid. Must be one of: {valid_categories}"
        )
    return category


class DocumentMeta(BaseModel):
    """
    Document metadata with strict category validation.
    
    Phase 0: Core document metadata structure.
    """
    title: Optional[str] = None
    document_number: Optional[str] = None
    category: str = Field(..., description="Must be one of the 5 exact category values")
    issued_date: Optional[str] = Field(None, description="ISO date format")
    year: Optional[int] = None
    version: int = Field(default=1, ge=1)
    is_current: bool = Field(default=True)
    
    @validator('category')
    def validate_category_field(cls, v):
        """Validate category against the 5 exact values."""
        return validate_category(v)
    
    @validator('issued_date')
    def validate_iso_date(cls, v):
        """Basic ISO date format validation."""
        if v is not None and v:
            # Basic check for ISO date format (YYYY-MM-DD)
            import re
            if not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
                raise ValueError("issued_date must be in ISO format (YYYY-MM-DD)")
        return v


class Chunk(BaseModel):
    """
    Document chunk with position and content information.
    
    Phase 0: Core chunk structure for document processing.
    """
    chunk_index: int = Field(..., ge=0, description="Zero-based chunk index")
    text: str = Field(..., min_length=1, description="Chunk text content")
    page_start: int = Field(..., ge=1, description="Starting page number (1-based)")
    page_end: int = Field(..., ge=1, description="Ending page number (1-based)")
    page_range: str = Field(..., description="Page range in format 'start-end' or 'single'")
    heading_path: List[str] = Field(default_factory=list, description="Hierarchical heading path")
    token_count: int = Field(..., ge=0, description="Number of tokens in chunk")
    source_file: Optional[str] = Field(None, description="Original filename for audit trail")
    
    @validator('page_end')
    def validate_page_range(cls, v, values):
        """Ensure page_end >= page_start."""
        if 'page_start' in values and v < values['page_start']:
            raise ValueError("page_end must be >= page_start")
        return v
    
    @validator('page_range', always=True)
    def validate_page_range_format(cls, v, values):
        """Auto-generate page_range if not provided."""
        if v is None or v == "":
            page_start = values.get('page_start')
            page_end = values.get('page_end')
            if page_start is not None and page_end is not None:
                if page_start == page_end:
                    return str(page_start)
                else:
                    return f"{page_start}-{page_end}"
        return v


class PreprocessResponse(BaseModel):
    """
    Complete preprocessing response containing document metadata and chunks.
    
    Phase 0: Response structure for document processing pipeline.
    """
    document: DocumentMeta = Field(..., description="Document metadata")
    chunks: List[Chunk] = Field(..., description="List of processed chunks")
    
    @validator('chunks')
    def validate_chunks_not_empty(cls, v):
        """Ensure at least one chunk is present."""
        if not v:
            raise ValueError("Document must have at least one chunk")
        return v