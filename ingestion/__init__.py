"""
Ingestion module for ACEP document processing.

Phase 0: Project scaffold with clean module layout and strict category validation.
"""

from .schemas import DocumentMeta, Chunk, PreprocessResponse, CATEGORIES
from . import extract, clean, structure, chunk, metadata

__all__ = [
    'DocumentMeta',
    'Chunk', 
    'PreprocessResponse',
    'CATEGORIES',
    'extract',
    'clean',
    'structure',
    'chunk',
    'metadata'
]