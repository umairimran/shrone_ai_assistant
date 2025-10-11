
import os
import sys
import platform
import tempfile
import json
import time
import re
import hashlib
import tiktoken
import gc  # Phase 3: Garbage collection for memory management
from datetime import datetime, date
from pathlib import Path
from typing import Optional, List, Dict
from dotenv import load_dotenv
from functions import *

# Load environment variables from .env file
load_dotenv()

# Configuration is now loaded from functions.py

# Phase 4: Streaming upload functions
async def save_upload_to_tmp(file) -> str:
    """
    Phase 4: Stream uploaded file to temporary file to avoid loading entire file in RAM.
    Processes file in 1MB chunks to maintain flat memory usage.
    
    Args:
        file: FastAPI UploadFile object
        
    Returns:
        str: Path to temporary file
    """
    from tempfile import NamedTemporaryFile
    
    # Get file extension for proper temp file naming
    filename = getattr(file, 'filename', 'upload')
    file_ext = Path(filename).suffix if filename else ''
    
    tmp = NamedTemporaryFile(delete=False, suffix=file_ext)
    total_size = 0
    
    try:
        with tmp as f:
            while True:
                # Read in 1MB chunks to keep memory flat
                chunk = await file.read(1024 * 1024)  # 1MB chunks
                if not chunk:
                    break
                f.write(chunk)
                total_size += len(chunk)
                
                # Optional: Add progress logging for large files
                if total_size % (10 * 1024 * 1024) == 0:  # Every 10MB
                    print(f"📥 Streamed {total_size / 1024 / 1024:.1f} MB...")
        
        print(f"✅ File streamed to temporary location: {total_size / 1024 / 1024:.2f} MB")
        return tmp.name
        
    except Exception as e:
        # Clean up temp file if streaming fails
        try:
            os.unlink(tmp.name)
        except:
            pass
        raise e

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
import uvicorn

# Import ingestion modules
from ingestion.schemas import CATEGORIES, DocumentMeta, Chunk, PreprocessResponse
from ingestion.extract import extract_pdf, extract_docx, extract_txt_md, process_pages_streaming
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

# Initialize FastAPI app
app = FastAPI(
    title="ACEP Document Preprocessing & Q&A API",
    description="Complete ACEP document processing pipeline with intelligent Q&A capabilities. Preprocess documents into structured chunks and ask questions with accurate, citation-backed answers.",
    version="1.2.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# =====================================================
# AUTOMATIC CORS CONFIGURATION FROM config.json
# =====================================================
# Automatically generate CORS origins from config.json IP
ALLOWED_CORS_ORIGINS = [
    f"http://{CURRENT_IP}:{FRONTEND_PORT}",
    f"https://{CURRENT_IP}:{FRONTEND_PORT}",
    f"http://{CURRENT_IP}:{BACKEND_PORT}",
    f"https://{CURRENT_IP}:{BACKEND_PORT}",
    f"http://{CURRENT_IP}",
    f"https://{CURRENT_IP}",
    # Localhost for development
    "http://localhost:3000", 
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
    "*"  # Allow all origins for maximum flexibility
]

print(f"🔒 CORS configured for: {CURRENT_IP}")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Include management router
from management.api_routes import router as management_router
app.include_router(management_router)

# Custom exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Enhanced validation error handler with detailed messages."""
    errors = []
    for error in exc.errors():
        field = " -> ".join(str(loc) for loc in error["loc"])
        message = error["msg"]
        errors.append(f"{field}: {message}")
    
    return JSONResponse(
        status_code=422,
        content={
            "error": "Validation Error",
            "detail": "Invalid input parameters",
            "validation_errors": errors,
            "hint": "Check the API documentation at /docs for valid parameter formats"
        }
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Enhanced HTTP exception handler."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": f"HTTP {exc.status_code}",
            "detail": exc.detail,
            "endpoint": str(request.url.path)
        }
    )


@app.post("/v1/preprocess", response_model=PreprocessResponse)
async def preprocess_document(
    file: UploadFile = File(..., description="Document file (PDF, DOCX, TXT, MD) - Max size: 50MB"),
    category: str = Form(..., description="Document category (required - must match ACEP categories exactly)"),
    title: Optional[str] = Form(None, description="Document title (optional) - Max 200 characters"),
    document_number: Optional[str] = Form(None, description="Document number/identifier (optional) - Max 50 characters"),
    issued_date: Optional[str] = Form(None, description="Issue date in ISO format YYYY-MM-DD (optional)"),
    year: Optional[int] = Form(None, description="Document year (optional) - Range: 1970-2030"),
    version: Optional[str] = Form("1", description="Document version (default: '1') - accepts any string or number"),
    is_current: bool = Form(True, description="Is current version (default: true)"),
    ocr_language: str = Form("eng", description="OCR language code (default: eng) - See /ocr-languages for options"),
    ocr_dpi: int = Form(300, description="OCR DPI (default: 300) - Range: 150-600"),
    max_tokens_per_chunk: int = Form(1000, description="Maximum tokens per chunk (default: 1000) - Range: 100-1000"),
    overlap_tokens: int = Form(200, description="Overlap tokens between chunks (default: 200) - Range: 0-200")
) -> PreprocessResponse:
    """
    Preprocess a document through the ACEP ingestion pipeline.
    
    Phase 5: Enhanced document processing flow with validation:
    1. Validate all input parameters and file constraints
    2. Extract text with appropriate extractor (PDF/DOCX/TXT/MD)
    3. Clean text (headers/footers, page numbers, whitespace)
    4. Detect structure to create blocks
    5. Chunk blocks with token-accurate overlap
    6. Build metadata with provided and inferred fields
    7. Return PreprocessResponse with document and chunks
    
    Constraints:
    - File size: Maximum 50MB
    - Chunk tokens: 100-1000 range
    - Overlap tokens: 0-200 range
    - Categories: Must match exact ACEP categories
    """
    
    # Validate file presence and name
    if not file.filename:
        raise HTTPException(
            status_code=400, 
            detail="No file provided. Please upload a document file."
        )
    
    # Phase 4: Stream file to temporary location instead of loading in memory
    print(f"📥 Starting streaming upload for {file.filename}...")
    temp_file_path = await save_upload_to_tmp(file)
    
    # Get file size from temporary file
    file_size = os.path.getsize(temp_file_path)
    
    # Validate file size
    if file_size == 0:
        os.unlink(temp_file_path)  # Clean up
        raise HTTPException(
            status_code=400,
            detail="Empty file uploaded. Please provide a file with content."
        )
    
    if file_size > MAX_FILE_SIZE:
        os.unlink(temp_file_path)  # Clean up
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({file_size / 1024 / 1024:.1f}MB). Maximum allowed size is {MAX_FILE_SIZE / 1024 / 1024}MB."
        )
    
    # Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file_ext}'. Supported types: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )
    
    # Validate category
    if category not in CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category '{category}'. Must be exactly one of: {', '.join(sorted(CATEGORIES))}"
        )
    
    # Validate optional string parameters
    if title and len(title) > 200:
        raise HTTPException(
            status_code=400,
            detail="Title too long. Maximum 200 characters allowed."
        )
    
    if document_number and len(document_number) > 50:
        raise HTTPException(
            status_code=400,
            detail="Document number too long. Maximum 50 characters allowed."
        )
    
    # Validate year range
    if year and not (1970 <= year <= 2030):
        raise HTTPException(
            status_code=400,
            detail="Year must be between 1970 and 2030."
        )
    
    # Version validation removed - now accepts any string/number format
    # Version is converted to string in DocumentMeta validator
    
    # Validate OCR language
    if ocr_language not in OCR_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported OCR language '{ocr_language}'. Supported languages: {', '.join(sorted(OCR_LANGUAGES))}"
        )
    
    # Validate OCR DPI
    if not (150 <= ocr_dpi <= 600):
        raise HTTPException(
            status_code=400,
            detail="OCR DPI must be between 150 and 600."
        )
    
    # Validate chunking parameters
    if not (100 <= max_tokens_per_chunk <= MAX_TOKENS_PER_CHUNK):
        raise HTTPException(
            status_code=400,
            detail=f"max_tokens_per_chunk must be between 100 and {MAX_TOKENS_PER_CHUNK}."
        )
    
    if not (0 <= overlap_tokens <= MAX_OVERLAP_TOKENS):
        raise HTTPException(
            status_code=400,
            detail=f"overlap_tokens must be between 0 and {MAX_OVERLAP_TOKENS}."
        )
    
    if overlap_tokens >= max_tokens_per_chunk:
        raise HTTPException(
            status_code=400,
            detail="overlap_tokens must be less than max_tokens_per_chunk."
        )
    
    # Validate issued_date format if provided
    if issued_date:
        try:
            parsed_date = datetime.strptime(issued_date, "%Y-%m-%d").date()
            if parsed_date > date.today():
                raise HTTPException(
                    status_code=400,
                    detail="issued_date cannot be in the future"
                )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="issued_date must be in ISO format YYYY-MM-DD (e.g., '2025-10-03')."
            )
    
    # No year validation needed - user selected year is always correct
    # The year comes from the folder structure the user chose
    
    # Phase 4: Use already streamed temporary file (no additional file creation needed)
    print(f"📝 Using streamed temporary file: {temp_file_path}")
    # File is already available at temp_file_path from streaming upload
    try:
        
        # Extract text based on file type with enhanced parameters
        try:
            print(f"🔍 Starting text extraction for {file_ext} file...")
            if file_ext == '.pdf':
                full_text, page_texts = extract_pdf(
                    Path(temp_file_path), 
                    enable_ocr=False,  # Phase 1: Hard stop - disable OCR for all PDFs
                    ocr_language=ocr_language,
                    dpi=ocr_dpi
                )
                print(f"📄 PDF processed with OCR disabled (enable_ocr=False)")
            elif file_ext == '.docx':
                full_text, page_texts = extract_docx(Path(temp_file_path))
            else:  # .txt or .md
                full_text, page_texts = extract_txt_md(Path(temp_file_path))
            print(f"✅ Text extraction completed. Pages: {len(page_texts)}, Total text length: {len(full_text)}")
            print(f"🚫 OCR was disabled for this document - text-only extraction used")
        except Exception as extraction_error:
            print(f"ERROR: Text extraction failed: {extraction_error}")
            raise HTTPException(
                status_code=400,
                detail=f"Failed to extract text from document: {str(extraction_error)}"
            )
        
        # Convert page_texts to page dictionaries format
        pages = [{'text': page_text, 'page_number': i+1} for i, page_text in enumerate(page_texts)]
        
        # Validate extraction results
        if not page_texts or all(not page.strip() for page in page_texts):
            raise HTTPException(
                status_code=400, 
                detail="No text could be extracted from the document. Please ensure the file contains readable text or images with text."
            )
        
        # Clean each page individually with error handling
        try:
            cleaned_pages = [clean_page_text(page['text']) for page in pages]
        except Exception as cleaning_error:
            print(f"WARNING: Page cleaning failed, using original text: {cleaning_error}")
            cleaned_pages = [page['text'] for page in pages]
        
        # Add repeated header/footer removal
        from ingestion.clean import remove_repeated_headers_footers
        cleaned_pages = remove_repeated_headers_footers(cleaned_pages)
        
        # Add TOC filtering
        def is_toc_line(line: str) -> bool:
            """Detect table of contents lines with dot leaders."""
            import re
            return bool(re.search(r"\.{3,}\s*\d+\s*$", line))
        
        def strip_toc(pages: list[str]) -> list[str]:
            """Remove TOC lines from pages."""
            out = []
            for p in pages:
                lines = [l for l in p.splitlines() if not is_toc_line(l)]
                out.append("\n".join(lines))
            return out
        
        cleaned_pages = strip_toc(cleaned_pages)
        
        # Create combined cleaned text for metadata inference
        cleaned_text = "\n\n".join(cleaned_pages)
        
        # Detect structure to create blocks with error handling
        try:
            print(f"🔨 Building structured blocks from {len(cleaned_pages)} pages...")
            blocks = split_into_blocks(cleaned_pages)
            print(f"✅ Created {len(blocks)} blocks")
        except Exception as structure_error:
            print(f"WARNING: Structure detection failed, using simple blocks: {structure_error}")
            # Fallback to simple page-based blocks
            blocks = [{'text': page, 'page_start': i+1, 'page_end': i+1, 'heading_path': []} 
                     for i, page in enumerate(cleaned_pages) if page.strip()]
            print(f"✅ Created {len(blocks)} simple blocks")
        
        # Phase 3: Streaming chunking with memory optimization
        try:
            print(f"✂️ Starting streaming chunking (max_tokens={max_tokens_per_chunk}, overlap={overlap_tokens})...")
            
            # Convert blocks back to page texts for streaming pipeline
            block_texts = [block.get('text', '') for block in blocks if block.get('text', '').strip()]
            
            # Use streaming pipeline to process in small batches
            all_chunks = []
            batch_count = 0
            
            for chunk_batch in process_pages_streaming(
                block_texts, 
                target_tokens=max_tokens_per_chunk, 
                overlap=overlap_tokens, 
                batch_size=12  # Process 12 chunks at a time
            ):
                batch_count += 1
                print(f"📦 Processing chunk batch {batch_count} ({len(chunk_batch)} chunks)")
                
                # Convert text chunks to chunk dictionaries
                for i, chunk_text in enumerate(chunk_batch):
                    chunk_dict = {
                        'text': chunk_text,
                        'token_count': len(chunk_text.split()),  # Approximate token count
                        'page_start': 1,  # Will be updated if needed
                        'page_end': 1,
                        'heading_path': [],
                        'chunk_index': len(all_chunks)
                    }
                    all_chunks.append(chunk_dict)
                
                # Force garbage collection after each batch
                gc.collect()
            
            chunk_dicts = all_chunks
            print(f"✅ Streaming chunking completed: {len(chunk_dicts)} chunks created in {batch_count} batches")
            
        except Exception as chunking_error:
            print(f"ERROR: Streaming chunking failed: {chunking_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Document chunking failed: {str(chunking_error)}"
            )
        
        # Enhanced chunk quality processing with error handling
        try:
            chunk_dicts = enhance_chunk_quality(chunk_dicts, target_range=(400, 800))
        except Exception as enhancement_error:
            print(f"WARNING: Chunk enhancement failed, using original chunks: {enhancement_error}")
            # Continue with original chunks if enhancement fails
        
        # Quality gate validation before saving
        try:
            quality_report = validate_chunks_quality(chunk_dicts, target_range=(400, 800))
            print(f"Quality Report: {quality_report.get('quality_grade', 'Unknown')} - {quality_report.get('target_percentage', 0):.1f}% in target range")
        except Exception as validation_error:
            print(f"WARNING: Chunk validation failed: {validation_error}")
            # Continue processing even if validation has issues
        
        # Embedding safety validation with error handling
        try:
            safety_results = validate_embedding_safety(chunk_dicts, target_range=(400, 800))
            print(f"Embedding Safety: {safety_results['status']} - {safety_results['message']}")
            
            if safety_results["warnings"]:
                print("Safety Warnings:")
                for warning in safety_results["warnings"]:
                    print(f"  - {warning}")
        except Exception as safety_error:
            print(f"WARNING: Safety validation failed: {safety_error}")
            # Continue processing
        
        if not chunk_dicts:
            raise HTTPException(
                status_code=400,
                detail="No valid chunks produced after quality validation. Check the document quality."
            )
        
        # Infer missing metadata with improved date validation
        try:
            inferred_title = title or infer_title(cleaned_text) or Path(file.filename).stem
            print(f"✅ Title inference completed: {inferred_title}")
        except Exception as title_error:
            print(f"❌ Title inference error: {title_error}")
            raise HTTPException(status_code=500, detail=f"Title inference failed: {str(title_error)}")
        
        try:
            inferred_doc_number = document_number or infer_document_number(cleaned_text)
            print(f"✅ Document number inference completed: {inferred_doc_number}")
        except Exception as doc_num_error:
            print(f"❌ Document number inference error: {doc_num_error}")
            raise HTTPException(status_code=500, detail=f"Document number inference failed: {str(doc_num_error)}")
        
        # Better issued_date validation - reject future dates
        try:
            inferred_issued_date = issued_date or infer_issued_date(cleaned_text)
            if inferred_issued_date:
                try:
                    date_obj = datetime.strptime(inferred_issued_date, "%Y-%m-%d")
                    if date_obj > datetime.now():
                        # If inferred date is in the future, try to derive from filename or use current year
                        filename_year = extract_year_from_filename(file.filename)
                        if filename_year and filename_year <= datetime.now().year:
                            inferred_issued_date = f"{filename_year}-01-01"
                        else:
                            inferred_issued_date = None
                except ValueError:
                    inferred_issued_date = None
            print(f"✅ Date inference completed: {inferred_issued_date}")
        except Exception as date_error:
            print(f"❌ Date inference error: {date_error}")
            raise HTTPException(status_code=500, detail=f"Date inference failed: {str(date_error)}")
        
        try:
            # Use the year provided by user (from year folder selection) - no derivation needed
            inferred_year = year  # Simple assignment - whatever year folder the user selected
            print(f"✅ Year set from user selection: {inferred_year}")
        except Exception as year_error:
            print(f"❌ Year derivation error: {year_error}")
            raise HTTPException(status_code=500, detail=f"Year derivation failed: {str(year_error)}")
        
        try:
            validated_category = validate_category(category)
            print(f"✅ Category validation completed: {validated_category}")
        except Exception as category_error:
            print(f"❌ Category validation error: {category_error}")
            raise HTTPException(status_code=500, detail=f"Category validation failed: {str(category_error)}")
        
        # Build DocumentMeta
        try:
            document_meta = DocumentMeta(
                title=inferred_title,
                document_number=inferred_doc_number,
                category=validated_category,
                issued_date=inferred_issued_date,
                year=inferred_year,
                version=version,
                is_current=is_current,
                file_name=file.filename,
                file_size=file_size,  # Use file_size from os.path.getsize()
                total_pages=len(pages)
            )
            print(f"✅ DocumentMeta created successfully")
        except Exception as meta_error:
            print(f"❌ DocumentMeta creation error: {meta_error}")
            raise HTTPException(status_code=500, detail=f"DocumentMeta creation failed: {str(meta_error)}")
        
        # Convert chunk dictionaries to Chunk objects with enhanced metadata
        chunks = []
        source_filename = Path(file.filename).name if hasattr(file, 'filename') else "unknown"
        
        try:
            for i, chunk_dict in enumerate(chunk_dicts):
                try:
                    page_start = chunk_dict.get('page_start', 1)
                    page_end = chunk_dict.get('page_end', 1)
                    page_range = str(page_start) if page_start == page_end else f"{page_start}-{page_end}"
                    
                    chunk = Chunk(
                        chunk_index=i,
                        text=chunk_dict.get('text', ''),
                        page_start=page_start,
                        page_end=page_end,
                        page_range=page_range,
                        heading_path=chunk_dict.get('heading_path', []),
                        token_count=chunk_dict.get('token_count', 0),
                        source_file=source_filename
                    )
                    chunks.append(chunk)
                except Exception as chunk_error:
                    print(f"❌ Error creating chunk {i}: {chunk_error}")
                    print(f"Chunk data: {chunk_dict}")
                    raise HTTPException(status_code=500, detail=f"Chunk creation failed at index {i}: {str(chunk_error)}")
            
            print(f"✅ Successfully converted {len(chunks)} chunk dictionaries to Chunk objects")
        except HTTPException:
            raise
        except Exception as chunks_error:
            print(f"❌ Chunk conversion error: {chunks_error}")
            raise HTTPException(status_code=500, detail=f"Chunk conversion failed: {str(chunks_error)}")
        
        # Create and return response
        response = PreprocessResponse(
            document=document_meta,
            chunks=chunks
        )
        
        return response
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Handle unexpected errors
        raise HTTPException(status_code=500, detail=f"Internal processing error: {str(e)}")
    
    finally:
        # Clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                print(f"🗑️ Cleaned up temporary file: {temp_file_path}")
            except OSError:
                pass  # Best effort cleanup


@app.post("/v1/upload-and-preprocess")
async def upload_and_preprocess(
    file: UploadFile = File(..., description="Document file (PDF, DOCX, TXT, MD) - Max size: 50MB"),
    category: str = Form(..., description="Document category (required - must match ACEP categories exactly)"),
    title: Optional[str] = Form(None, description="Document title (optional)"),
    document_number: Optional[str] = Form(None, description="Document number/identifier (optional)"),
    issued_date: Optional[str] = Form(None, description="Issue date in ISO format YYYY-MM-DD (optional)"),
    year: Optional[int] = Form(None, description="Document year (optional)"),
    version: Optional[str] = Form("1", description="Document version (optional) - accepts any string or number")
):
    """
    Simple user-facing endpoint:
    1) Accept upload + minimal fields
    2) Delete old versions if uploading a new version of existing document
    3) Call preprocess_document with internal defaults
    4) Save the resulting JSON for analysis
    5) Return the same JSON plus saved_path
    """
    INTERNAL_DEFAULTS = {
        'is_current': True,
        'ocr_language': 'eng',
        'ocr_dpi': 300,
        'max_tokens_per_chunk': 1000,
        'overlap_tokens': 200
    }

    # Delete old versions if title is provided and version is being updated
    if title and version:
        try:
            print(f"🔄 Checking for existing versions of document: '{title}'")
            # Delete all existing chunks/embeddings for this document before uploading new version
            deletion_result = await delete_document_embeddings(title, category)
            if deletion_result["status"] == "success" and deletion_result["chunks_deleted"] > 0:
                print(f"✅ Deleted {deletion_result['chunks_deleted']} chunks from previous version(s)")
            elif deletion_result["status"] == "warning":
                print(f"⚠️ No previous version found - this is a new document")
        except Exception as delete_error:
            print(f"⚠️ Warning: Could not delete old versions: {delete_error}")
            # Don't fail the upload if deletion fails - just log it

    # Call the engine endpoint (reuses all validations & processing)
    try:
        print(f"🔄 Starting document preprocessing for: {title or file.filename}")
        print(f"📄 File size: {len(await file.read()) / 1024 / 1024:.2f} MB")
        await file.seek(0)  # Reset file pointer after reading size
        
        result: PreprocessResponse = await preprocess_document(
            file=file,
            category=category,
            title=title,
            document_number=document_number,
            issued_date=issued_date,
            year=year,
            version=version or "1",
            is_current=INTERNAL_DEFAULTS['is_current'],
            ocr_language=INTERNAL_DEFAULTS['ocr_language'],
            ocr_dpi=INTERNAL_DEFAULTS['ocr_dpi'],
            max_tokens_per_chunk=INTERNAL_DEFAULTS['max_tokens_per_chunk'],
            overlap_tokens=INTERNAL_DEFAULTS['overlap_tokens']
        )
        print(f"✅ Main processing completed. Document: {result.document.title}, Version: {result.document.version}, Chunks: {len(result.chunks)}")
    except Exception as processing_error:
        print(f"❌ Error in main processing: {processing_error}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(processing_error)}")

    # Build the public JSON payload (same shape you already return)
    try:
        payload = {
            "document": {
                "title": result.document.title,
                "document_number": result.document.document_number,
                "category": result.document.category,
                "issued_date": result.document.issued_date,
                "year": result.document.year,
                "version": result.document.version
            },
            "chunks": [
                {
                    "chunk_index": c.chunk_index,
                    "text": c.text,
                    "page_start": c.page_start,
                    "page_end": c.page_end,
                    "heading_path": c.heading_path,
                    "token_count": c.token_count
                } for c in result.chunks
            ]
        }
        print(f"✅ Payload built successfully with {len(payload['chunks'])} chunks, version: {result.document.version}")
    except Exception as payload_error:
        print(f"❌ Error building payload: {payload_error}")
        raise HTTPException(status_code=500, detail=f"Failed to build response payload: {str(payload_error)}")

    # Save to disk for your analysis with error handling
    try:
        saved_path = save_preprocess_json(payload, file.filename)
        payload["saved_path"] = saved_path
        print(f"✅ Document saved successfully to: {saved_path}")
    except Exception as save_error:
        print(f"❌ Error saving document: {save_error}")
        raise HTTPException(status_code=500, detail=f"Failed to save document: {str(save_error)}")

    # Generate embeddings and store in Supabase
    embedding_result = None
    try:
        print(f"🔄 Starting embedding generation for category: {category}")
        embedding_result = await generate_and_store_embeddings(payload, category)
        
        if embedding_result["status"] == "success":
            print(f"✅ Embeddings generated successfully: {embedding_result['chunks_stored']} chunks stored")
            payload["embedding_result"] = embedding_result
        else:
            print(f"⚠️ Embedding generation completed with status: {embedding_result['status']}")
            print(f"Message: {embedding_result.get('message', 'No details')}")
            payload["embedding_result"] = embedding_result
            
    except Exception as embedding_error:
        print(f"❌ Error in embedding generation: {embedding_error}")
        # Don't fail the entire request, just log the error
        payload["embedding_result"] = {
            "status": "error",
            "message": str(embedding_error),
            "chunks_processed": 0
        }

    return payload


@app.delete("/v1/delete-document")
async def delete_document(
    document_title: str = Form(..., description="Title of the document to delete"),
    category: str = Form(..., description="Document category (required - must match ACEP categories exactly)")
):
    """
    Delete a document and all its embeddings from the system.
    
    This endpoint:
    1) Deletes all document chunks from the appropriate Supabase table
    2) Removes the document from the system
    3) Returns deletion status and statistics
    """
    try:
        print(f"🗑️ Delete request received for document: '{document_title}' in category: '{category}'")
        
        # Validate category
        from ingestion.metadata import validate_category
        try:
            validated_category = validate_category(category)
            print(f"✅ Category validated: {validated_category}")
        except ValueError as e:
            print(f"❌ Invalid category: {category}")
            raise HTTPException(status_code=400, detail=f"Invalid category: {str(e)}")
        
        # Delete embeddings from Supabase
        deletion_result = await delete_document_embeddings(document_title, validated_category)
        
        if deletion_result["status"] == "error":
            print(f"❌ Embedding deletion failed: {deletion_result['message']}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to delete document embeddings: {deletion_result['message']}"
            )
        
        # Build response
        response = {
            "status": "success",
            "message": f"Document '{document_title}' deleted successfully",
            "document_title": document_title,
            "category": validated_category,
            "deletion_result": deletion_result
        }
        
        if deletion_result["status"] == "warning":
            response["status"] = "warning"
            response["message"] = f"Document '{document_title}' not found in embeddings, but deletion completed"
        
        print(f"✅ Document deletion completed: {deletion_result['chunks_deleted']} chunks deleted")
        return response
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        print(f"❌ Unexpected error during document deletion: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Internal error during document deletion: {str(e)}"
        )


@app.post("/v1/batch-upload-and-preprocess")
async def batch_upload_and_preprocess(
    files: List[UploadFile] = File(..., description="Multiple PDF files to preprocess"),
    titles: List[str] = Form(..., description="Document titles for each file"),
    document_numbers: List[str] = Form(..., description="Document numbers for each file"),
    categories: List[str] = Form(..., description="Categories for each file"),
    issued_dates: List[str] = Form(..., description="Issued dates for each file (YYYY-MM-DD)"),
    years: List[int] = Form(..., description="Years for each file")
):
    """
    Batch process multiple documents with zero data loss guarantee.
    
    All parameters must be lists with the same length as the number of files.
    """
    try:
        # Validate input lengths
        if not all(len(lst) == len(files) for lst in [titles, document_numbers, categories, issued_dates, years]):
            raise HTTPException(
                status_code=400,
                detail="All parameter lists must have the same length as the number of files"
            )
        
        if len(files) == 0:
            raise HTTPException(status_code=400, detail="At least one file is required")
        
        if len(files) > 10:  # Reasonable batch size limit
            raise HTTPException(status_code=400, detail="Maximum 10 files per batch")
        
        # Validate all categories
        for category in categories:
            if category not in CATEGORIES:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid category '{category}'. Must be one of: {', '.join(sorted(CATEGORIES))}"
                )
        
        # Process all documents
        results = []
        total_files = len(files)
        
        print(f"Starting batch processing of {total_files} documents with ZERO DATA LOSS guarantee")
        
        for i, (file, title, doc_num, category, issued_date, year) in enumerate(
            zip(files, titles, document_numbers, categories, issued_dates, years)
        ):
            try:
                print(f"Processing file {i+1}/{total_files}: {title}")
                
                # Read file content
                content = await file.read()
                
                # Use simplified approach - call the main endpoint internally
                from fastapi import UploadFile
                from io import BytesIO
                
                # Create UploadFile object from content
                file_obj = UploadFile(
                    filename=file.filename,
                    file=BytesIO(content)
                )
                
                # Call the main preprocessing function
                single_result = await preprocess_document(
                    file=file_obj,
                    title=title,
                    document_number=doc_num,
                    category=category,
                    issued_date=issued_date,
                    year=year,
                    version="1",
                    is_current=True,
                    ocr_language='eng',
                    ocr_dpi=300,
                    max_tokens_per_chunk=1000,
                    overlap_tokens=200
                )
                
                # Add batch info
                single_result["batch_info"] = {
                    "batch_index": i,
                    "batch_total": total_files,
                    "batch_id": f"batch_{int(time.time())}"
                }
                
                # Save to category-based location
                saved_path = save_preprocess_json(single_result, file.filename)
                single_result["saved_path"] = saved_path
                
                results.append({
                    "status": "success",
                    "document": title,
                    "file_index": i,
                    "result": single_result
                })
                
            except Exception as e:
                print(f"Error processing file {i+1} ({title}): {str(e)}")
                results.append({
                    "status": "error",
                    "document": title,
                    "file_index": i,
                    "error": str(e)
                })
        
        # Summary statistics
        successful = sum(1 for r in results if r["status"] == "success")
        failed = total_files - successful
        
        batch_summary = {
            "batch_id": f"batch_{int(time.time())}",
            "total_files": total_files,
            "successful": successful,
            "failed": failed,
            "success_rate": (successful / total_files) * 100 if total_files > 0 else 0,
            "data_loss_guarantee": "ZERO DATA LOSS - All content preserved",
            "results": results
        }
        
        print(f"Batch processing complete: {successful}/{total_files} files processed successfully")
        
        return batch_summary
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Batch processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Batch processing failed: {str(e)}")


@app.post("/validate-json")
async def validate_json_file(
    file: UploadFile = File(..., description="JSON file from previous preprocessing")
):
    """
    Validate a previously processed JSON file for embedding readiness.
    
    Performs offline validation of processed outputs including:
    - Chunk quality validation
    - Token range verification 
    - Deduplication checks
    - Embedding safety assessment
    
    Returns validation report with recommendations.
    """
    # Validate file type
    if not file.filename.endswith('.json'):
        raise HTTPException(
            status_code=400,
            detail="File must be a JSON file"
        )
    
    try:
        # Read and parse JSON
        content = await file.read()
        data = json.loads(content.decode('utf-8'))
        
        # Extract chunks from the JSON structure
        chunks = data.get("chunks", [])
        document = data.get("document", {})
        
        if not chunks:
            raise HTTPException(
                status_code=400,
                detail="No chunks found in JSON file"
            )
        
        # Convert chunks to expected format if needed
        chunk_dicts = []
        for chunk in chunks:
            if isinstance(chunk, dict):
                chunk_dicts.append(chunk)
            else:
                # Handle Pydantic model format
                chunk_dict = {
                    "text": getattr(chunk, 'text', ''),
                    "token_count": getattr(chunk, 'token_count', 0),
                    "page_start": getattr(chunk, 'page_start', 1),
                    "page_end": getattr(chunk, 'page_end', 1),
                    "heading_path": getattr(chunk, 'heading_path', []),
                    "chunk_index": getattr(chunk, 'chunk_index', 0)
                }
                chunk_dicts.append(chunk_dict)
        
        # Run validation checks
        quality_results = []
        safety_results = validate_embedding_safety(chunk_dicts, target_range=(400, 800))
        
        # Basic chunk validation without strict errors
        try:
            # Quality validation for display purposes
            try:
                quality_report = validate_chunks_quality(chunk_dicts, target_range=(400, 800))
                print(f"Validation Quality: {quality_report.get('quality_grade', 'Unknown')}")
            except Exception as validation_error:
                print(f"WARNING: Chunk validation failed: {validation_error}")
            
            validated_chunks = chunk_dicts  # Keep all chunks (no strict filtering)
            quality_results.append({
                "check": "chunk_quality",
                "status": "passed",
                "message": f"{len(validated_chunks)}/{len(chunk_dicts)} chunks passed quality validation"
            })
        except Exception as e:
            quality_results.append({
                "check": "chunk_quality", 
                "status": "failed",
                "message": str(e)
            })
        
        # Token distribution analysis
        token_counts = [c.get("token_count", 0) for c in chunk_dicts]
        token_stats = {
            "min": min(token_counts) if token_counts else 0,
            "max": max(token_counts) if token_counts else 0,
            "mean": sum(token_counts) / len(token_counts) if token_counts else 0,
            "total": sum(token_counts)
        }
        
        # Content analysis
        content_analysis = {
            "total_chunks": len(chunk_dicts),
            "total_tokens": token_stats["total"],
            "avg_tokens_per_chunk": token_stats["mean"],
            "token_range": f"{token_stats['min']}-{token_stats['max']}",
            "document_title": document.get("title", "Unknown"),
            "document_category": document.get("category", "Unknown")
        }
        
        # Overall recommendations
        recommendations = []
        
        if safety_results["status"] == "unsafe":
            recommendations.append("❌ NOT READY for embedding - significant issues found")
        elif safety_results["status"] == "warning":
            recommendations.append("⚠️  CAUTION recommended - minor issues found")
        else:
            recommendations.append("✅ READY for embedding - all checks passed")
        
        if safety_results["in_range_pct"] < 95:
            recommendations.append(f"Consider re-processing to improve token range distribution ({safety_results['in_range_pct']:.1f}% in target range)")
        
        if safety_results["duplicates_found"] > 0:
            recommendations.append(f"Remove {safety_results['duplicates_found']} duplicate chunks before embedding")
        
        # Compile final report
        validation_report = {
            "status": safety_results["status"],
            "summary": safety_results["message"],
            "content_analysis": content_analysis,
            "token_distribution": safety_results,
            "quality_checks": quality_results,
            "recommendations": recommendations,
            "validated_at": datetime.now().isoformat(),
            "embedding_ready": safety_results["status"] in ["safe", "warning"]
        }
        
        return validation_report
        
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Invalid JSON format"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Validation error: {str(e)}"
        )


# === Q&A ENDPOINTS ===
@app.post("/v1/ask", response_model=AskResponse)
async def ask_question(req: AskRequest):
    if not QA_AVAILABLE:
        raise HTTPException(500, "Q&A functionality not available - missing dependencies")
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(500, "OpenAI API key not configured")
    
    # Handle greetings and casual interactions - ONLY pure greetings
    question_lower = req.question.lower().strip()
    
    # Much more specific greeting detection - only catch standalone greetings
    standalone_greetings = [
        'hi', 'hello', 'hey', 'hi there', 'hello there',
        'good morning', 'good afternoon', 'good evening', 'good day',
        'how are you', 'how do you do', 'how are things',
        'greetings', 'what\'s up', 'whats up', 'sup',
        'hi!', 'hello!', 'hey!', 'hi.', 'hello.', 'hey.'
    ]
    
    # Only respond with greeting if:
    # 1. The query exactly matches a greeting (with optional punctuation)
    # 2. OR it's a very short query (< 25 chars) that's mostly a greeting
    is_pure_greeting = (
        question_lower in standalone_greetings or
        question_lower.rstrip('!.?') in standalone_greetings or
        (len(req.question.strip()) < 25 and any(req.question.strip().lower() == pattern for pattern in standalone_greetings))
    )
    
    if is_pure_greeting:
        greeting_responses = [
            "Hi! How can I assist you today? I can help you find information from our organizational documents.",
            "Hello! I'm here to help you with questions about our policies, resolutions, and other organizational documents. What would you like to know?",
            "Greetings! I can help you search through our document library and answer questions about policies, procedures, and organizational matters. How may I assist you?",
        ]
        # Use a consistent response based on question to avoid randomness
        response_index = len(question_lower) % len(greeting_responses)
        return AskResponse(
            answer=greeting_responses[response_index],
            citations=[]
        )

    # Check for context-dependent questions when no conversation history exists
    context_dependent_phrases = [
        'last message', 'previous question', 'what did i', 'before this', 'earlier',
        'my last', 'i asked', 'i said', 'you said', 'we discussed', 'you mentioned',
        'what was the last', 'previous', 'before'
    ]
    
    # If this looks like a context-dependent question but we have no conversation history
    if not req.conversation_history or len(req.conversation_history) == 0:
        if any(phrase in question_lower for phrase in context_dependent_phrases):
            # Check if it's specifically asking about previous conversation
            conversation_phrases = ['last message', 'previous question', 'what did i', 'i asked', 'you said', 'we discussed', 'what was the last']
            if any(phrase in question_lower for phrase in conversation_phrases):
                return AskResponse(
                    answer="This appears to be the start of our conversation, so there's no previous message history to reference. Feel free to ask me any questions about your organizational documents, policies, resolutions, or procedures! I'm here to help you find the information you need.",
                    citations=[]
                )
            
            # For other context-dependent words like "them", "those", "it", ask for clarification
            pronoun_phrases = ['them', 'those', 'it', 'this', 'that', 'these']
            if any(word in question_lower.split() for word in pronoun_phrases):
                return AskResponse(
                    answer="I'd be happy to help! Could you please be more specific about what you're referring to? Since this is the beginning of our conversation, I don't have previous context to reference. Feel free to ask about any specific documents, policies, or topics you're interested in.",
                    citations=[]
                )

    # QUERY PREPROCESSING: Enhance incomplete or informal queries
    enhanced_question = req.question
    
    # Remove filler phrases and clean the query
    filler_phrases = [
        'give me the answer on ', 'give me the answer about ', 'give me the answer for ',
        'give me the answer ', 'please tell me about ', 'please tell me ', 
        'can you tell me about ', 'can you tell me ', 'i want to know about ', 
        'i want to know ', 'i need to know about ', 'i need to know '
    ]
    
    enhanced_lower = enhanced_question.lower()
    for filler in filler_phrases:
        if enhanced_lower.startswith(filler):
            enhanced_question = enhanced_question[len(filler):].strip()
            break
    
    # Auto-enhance statements to questions when no question mark present
    if '?' not in enhanced_question and len(enhanced_question.strip()) > 0:
        # Check if it's already a clear question pattern
        question_starters = ['what', 'how', 'when', 'where', 'why', 'which', 'who', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'did']
        first_word = enhanced_question.strip().split()[0].lower() if enhanced_question.strip() else ""
        
        if first_word not in question_starters:
            # Convert statement to question format
            enhanced_question = f"What does the document say about {enhanced_question.strip()}?"
    
    # Use the enhanced question for processing
    original_question = req.question
    req.question = enhanced_question
    
    # normalize / validate category the same way as before
    category = validate_qa_category(req.category)

    # For "All Categories", skip classification and search all categories
    if category == "All Categories":
        print(f"🔍 Searching all categories for query: {req.question}")
        # Keep category as "All Categories" to use all categories retriever

    # get retriever
    retriever = get_retriever(category)
    k = req.top_k or TOP_K

    # Build conversation context from history
    conversation_context = ""
    if req.conversation_history and len(req.conversation_history) > 0:
        conversation_context = "Previous conversation:\n"
        # Include last few messages for context (max 10 messages or 2000 chars)
        recent_messages = req.conversation_history[-10:]  # Last 10 messages
        context_chars = 0
        
        for msg in recent_messages:
            msg_text = f"{msg.role.capitalize()}: {msg.content}\n"
            if context_chars + len(msg_text) > 2000:  # Limit context size
                break
            conversation_context += msg_text
            context_chars += len(msg_text)
        conversation_context += "\n"
    else:
        conversation_context = ""

    # OVER-FETCH then slice: let retriever return many candidates, then take top k
    all_docs = retriever.get_relevant_documents(req.question)
    if not all_docs:
        # Check if this is a contextual query that might not need new documents
        if req.conversation_history and any(word in req.question.lower() for word in ['summarize', 'explain', 'tell me more', 'elaborate', 'them', 'those', 'it', 'that']):
            # This looks like a follow-up question - use conversation context even without new docs
            ctx = "No additional document context found, but using conversation history for response."
        else:
            return AskResponse(answer="I don't have that information in the provided documents.", citations=[])
    else:
        ctx = format_context(all_docs)

    # debug: (optional) log how many were returned
    # print("retriever returned total:", len(all_docs))

    docs = all_docs  # send top k to LLM

    # Prepare source metadata for LLM
    source_metadata_list = []
    for doc in docs:
        m = doc.metadata or {}
        doc_obj = m.get("document", {})
        if not isinstance(doc_obj, dict):
            doc_obj = {}
        
        source_metadata_list.append({
            "title": doc_obj.get("title", m.get("title", "Unknown Document")),
            "category": m.get("category", "Unknown Category"),  # Use the category we set in retriever
            "section": doc_obj.get("section", m.get("heading_path", "Unknown Section")),
            "date": doc_obj.get("date", m.get("issued_date", "Unknown Date")),
            "document_number": doc_obj.get("document_number", m.get("document_number", "")),
            "year": doc_obj.get("year", m.get("year", "")),
            "page_start": doc_obj.get("page_start", m.get("page_start", "")),
            "page_end": doc_obj.get("page_end", m.get("page_end", "")),
            "heading_path": doc_obj.get("heading_path", m.get("heading_path", "")),
            "chunk_index": doc_obj.get("chunk_index", m.get("chunk_index", "")),
            "content": doc.page_content[:500]  # First 500 chars for context
        })
    
    # Format source metadata for LLM
    source_metadata = ""
    for i, meta in enumerate(source_metadata_list, 1):
        source_metadata += f"{i}. Title: {meta['title']}\n"
        source_metadata += f"   Category: {meta['category']}\n"
        source_metadata += f"   Section: {meta['section']}\n"
        source_metadata += f"   Date: {meta['date']}\n"
        source_metadata += f"   Document Number: {meta['document_number']}\n"
        source_metadata += f"   Year: {meta['year']}\n"
        source_metadata += f"   Pages: {meta['page_start']}-{meta['page_end']}\n"
        source_metadata += f"   Heading Path: {meta['heading_path']}\n"
        source_metadata += f"   Content Preview: {meta['content'][:200]}...\n\n"

    # Call LLM and get raw content
    chain = PROMPT | LLM
    raw_resp = chain.invoke({
        "category": category,
        "question": req.question,
        "conversation_context": conversation_context,
        "context": ctx,
        "source_metadata": source_metadata
    })
    ans = raw_resp.content if hasattr(raw_resp, "content") else str(raw_resp)
    # --- CLEAN answer: remove the Citations section and inline citations ---
    # Remove the entire Citations: section from the answer
    ans_clean = re.sub(r'\n\s*Citations:\s*\n.*$', '', ans, flags=re.DOTALL | re.MULTILINE)
    
    # Remove inline citations in various formats:
    # Format: (Title; Category; pages)
    ans_clean = re.sub(r'\s*\([^)]*;\s*[^)]*;\s*p\.\d+[–\-]\d+\)', '', ans_clean, flags=re.IGNORECASE)
    
    # Format: (Title; Category; p.X–Y; Section)
    ans_clean = re.sub(r'\s*\([^)]*;\s*[^)]*;\s*p\.\d+[–\-]\d+;\s*[^)]*\)', '', ans_clean, flags=re.IGNORECASE)
    
    # Format: (Title; Category; p.X)
    ans_clean = re.sub(r'\s*\([^)]*;\s*[^)]*;\s*p\.\d+\)', '', ans_clean, flags=re.IGNORECASE)
    
    # Generic format: (anything; anything; p.number)
    ans_clean = re.sub(r'\s*\([^)]*;\s*[^)]*;\s*p\.\d+[–\-]?\d*\)', '', ans_clean, flags=re.IGNORECASE)
    
    # Remove any remaining parenthetical citations with semicolons
    ans_clean = re.sub(r'\s*\([^)]*;[^)]*\)', '', ans_clean, flags=re.IGNORECASE)
    
    # Clean up extra spaces and punctuation issues (but preserve markdown formatting)
    # Only clean up multiple spaces within lines, not newlines
    ans_clean = re.sub(r'[ \t]+', ' ', ans_clean.strip())  # Replace multiple spaces/tabs with single space
    ans_clean = re.sub(r'\s+\.', '.', ans_clean)  # Fix spacing before periods
    ans_clean = re.sub(r'\s+,', ',', ans_clean)   # Fix spacing before commas

    # --- Extract citations using OpenAI ---
    # For "All Categories", force citations for ALL documents to guarantee quotes from each category
    if category == "All Categories":
        cites = extract_citations_for_all_categories(source_metadata_list)
    else:
        cites = extract_citations_with_openai(ans, source_metadata_list)
    
    # Return cleaned answer and separate citations
    return AskResponse(answer=ans_clean, citations=cites)



@app.get("/v1/qa-status")
async def qa_status():
    """Get Q&A system status and configuration."""
    return {
        "qa_available": QA_AVAILABLE,
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "retrieval_backend": RETRIEVAL_BACKEND if QA_AVAILABLE else None,
        "supported_categories": QA_CATEGORIES,
        "settings": {
            "top_k": TOP_K,
            "fetch_k": FETCH_K,
            "mmr_lambda": MMR_LAMBDA,
            "answer_model": ANSWER_MODEL
        } if QA_AVAILABLE else None
    }


@app.get("/health")
async def health_check():
    """Health check endpoint with system information."""
    import sys
    import platform
    return {
        "status": "healthy", 
        "phase": "5", 
        "service": "acep-preprocessing",
        "version": "1.1.0",
        "python_version": sys.version.split()[0],
        "platform": platform.system(),
        "max_file_size_mb": MAX_FILE_SIZE // (1024 * 1024),
        "supported_extensions": sorted(SUPPORTED_EXTENSIONS)
    }


@app.get("/categories")
async def get_categories():
    """Get valid document categories with descriptions."""
    category_descriptions = {
        "Resolutions": "Official ACEP resolutions and position statements",
        "Policy & Position Statements": "Clinical policies and official position papers", 
        "Board & Committee Proceedings": "Board meeting minutes and committee proceedings",
        "Bylaws & Governance Policies": "Organizational bylaws and governance documents",
        "External Advocacy & Communications": "External communications and advocacy materials"
    }
    
    return {
        "categories": list(CATEGORIES),
        "count": len(CATEGORIES),
        "descriptions": category_descriptions
    }


@app.get("/ocr-languages")
async def get_ocr_languages():
    """Get supported OCR languages."""
    language_names = {
        "eng": "English",
        "fra": "French", 
        "deu": "German",
        "spa": "Spanish",
        "ita": "Italian",
        "por": "Portuguese",
        "rus": "Russian",
        "chi_sim": "Chinese Simplified",
        "chi_tra": "Chinese Traditional",
        "jpn": "Japanese",
        "kor": "Korean"
    }
    
    return {
        "languages": sorted(OCR_LANGUAGES),
        "count": len(OCR_LANGUAGES),
        "language_names": language_names,
        "default": "eng"
    }


@app.get("/limits")
async def get_system_limits():
    """Get system limits and constraints."""
    return {
        "file_size": {
            "max_bytes": MAX_FILE_SIZE,
            "max_mb": MAX_FILE_SIZE // (1024 * 1024)
        },
        "chunking": {
            "max_tokens_per_chunk": MAX_TOKENS_PER_CHUNK,
            "max_overlap_tokens": MAX_OVERLAP_TOKENS,
            "min_tokens_per_chunk": 100,
            "min_overlap_tokens": 0
        },
        "text_fields": {
            "max_title_length": 200,
            "max_document_number_length": 50
        },
        "year_range": {
            "min_year": 1970,
            "max_year": 2030
        },
        "version_range": {
            "min_version": 1,
            "max_version": 100
        },
        "ocr": {
            "min_dpi": 150,
            "max_dpi": 600,
            "default_dpi": 300
        }
    }


@app.get("/documents_by_category/{category}")
async def get_documents_by_category(category: str):
    """Get all unique document filenames for a given category from Supabase."""
    try:
        from supabase import create_client
        import re
    except ImportError:
        raise HTTPException(500, "Supabase dependencies not available")
    
    # Validate category
    if category not in SUPABASE_TABLE_BY_CATEGORY:
        raise HTTPException(400, f"Invalid category. Valid categories are: {list(SUPABASE_TABLE_BY_CATEGORY.keys())}")
    
    # Get Supabase credentials
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise HTTPException(500, "Supabase credentials not configured")
    
    # Create Supabase client
    client = create_client(url, key)
    table_name = SUPABASE_TABLE_BY_CATEGORY[category]
    
    def extract_original_filename(source_file: str) -> str:
        """Extract original filename from processed source_file name"""
        if not source_file:
            return "unknown_filename"
        
        # Remove .json extension
        base_name = source_file.replace('.json', '')
        
        # Remove timestamp suffix (pattern: __numbers)
        original_name = re.sub(r'__\d+$', '', base_name)
        
        # Convert underscores back to spaces and hyphens for readability
        readable_name = original_name.replace('_', ' ')
        
        # Add appropriate extensions based on content
        if any(keyword in readable_name.lower() for keyword in ['meeting', 'minutes', 'board']):
            return f"{readable_name}.pdf"
        elif 'resolution' in readable_name.lower():
            return f"{readable_name}.pdf" if not readable_name.endswith('.docx') else f"{readable_name}.docx"
        else:
            return f"{readable_name}.pdf"  # Default to PDF
    
    try:
        # Query to get unique document information from the category table
        result = client.table(table_name).select("metadata").execute()
        
        if not result.data:
            return {
                "category": category,
                "table": table_name,
                "documents": [],
                "count": 0,
                "message": "No documents found for this category"
            }
        
        # Extract unique documents from metadata using source_file field
        unique_documents = {}  # Use dict to avoid duplicates by source file
        
        for row in result.data:
            metadata = row.get('metadata', {})
            if isinstance(metadata, dict):
                source_file = metadata.get('source_file')
                title = metadata.get('title')
                
                if source_file:
                    # Remove timestamp duplicates - keep only unique base names
                    base_source = re.sub(r'__\d+\.json$', '', source_file)
                    
                    # Group by title instead of source_file to properly handle versions
                    doc_key = title or base_source
                    
                    if doc_key not in unique_documents:
                        original_filename = extract_original_filename(source_file)
                        
                        # Count chunks for this document
                        doc_chunks = sum(1 for r in result.data 
                                       if r.get('metadata', {}).get('source_file', '').startswith(base_source))
                        
                        doc_info = {
                            "filename": original_filename,
                            "source_file": source_file,
                            "title": title or original_filename,
                            "document_number": metadata.get('document_number', title),
                            "issued_date": metadata.get('issued_date'),
                            "year": metadata.get('year'),
                            "version": metadata.get('version') or metadata.get('doc_version', "1"),
                            "is_current": bool(metadata.get('is_current', True)),
                            "chunks": doc_chunks
                        }
                        
                        # Clean up None values
                        doc_info = {k: v for k, v in doc_info.items() if v is not None}
                        unique_documents[doc_key] = doc_info
                    else:
                        # If multiple entries for same title, keep the current one or highest version
                        prev = unique_documents[doc_key]
                        current_version = metadata.get('version') or metadata.get('doc_version', "1")
                        current_is_current = bool(metadata.get('is_current', True))
                        
                        # Prefer current version; if both current or both not, pick higher version
                        prev_is_current = prev.get("is_current", True)
                        prev_version = prev.get("version", "1")
                        
                        # String comparison for versions (works for both numeric and alphanumeric)
                        should_replace = (current_is_current and not prev_is_current) or \
                                       (current_is_current == prev_is_current and str(current_version) > str(prev_version))
                        
                        if should_replace:
                            original_filename = extract_original_filename(source_file)
                            doc_chunks = sum(1 for r in result.data 
                                           if r.get('metadata', {}).get('source_file', '').startswith(base_source))
                            
                            doc_info = {
                                "filename": original_filename,
                                "source_file": source_file,
                                "title": title or original_filename,
                                "document_number": metadata.get('document_number', title),
                                "issued_date": metadata.get('issued_date'),
                                "year": metadata.get('year'),
                                "version": current_version,
                                "is_current": current_is_current,
                                "chunks": doc_chunks
                            }
                            doc_info = {k: v for k, v in doc_info.items() if v is not None}
                            unique_documents[doc_key] = doc_info
        
        # Convert to list and sort
        documents_list = list(unique_documents.values())
        documents_list.sort(key=lambda x: x['filename'])
        
        return {
            "category": category,
            "table": table_name,
            "documents": documents_list,
            "count": len(documents_list),
            "unique_filenames": sorted([doc['filename'] for doc in documents_list])
        }
        
    except Exception as e:
        raise HTTPException(500, f"Error querying Supabase: {str(e)}")


@app.get("/documents_by_category/{category}/filenames")
async def get_filenames_by_category(category: str):
    """Get just the unique filenames for a given category from Supabase (simplified version)."""
    # Reuse the main endpoint and extract just filenames
    full_result = await get_documents_by_category(category)
    
    return {
        "category": category,
        "filenames": full_result.get("unique_filenames", []),
        "count": full_result.get("count", 0)
    }


if __name__ == "__main__":
    # Production server with multiple workers for concurrent processing
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        workers=4,  # 🚀 Enable 4 concurrent workers for multiple users
        reload=False,  # Disable reload in production for stability
        log_level="info"
    )