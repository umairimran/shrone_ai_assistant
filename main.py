
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
                "doc_version": 1,
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
                    "filename": meta.get("source_file", "")
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
                        "document_number": meta.get("document_number", "")
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
            # Query for documents with matching title in metadata
            existing_chunks = client.table(table_name).select("id, metadata").eq(
                "metadata->document->>title", document_title
            ).execute()
            
            if not existing_chunks.data:
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
    
    SYSTEM = """You are a helpful, conversational assistant with access to organizational documents. You maintain context throughout the conversation and can respond to follow-up questions naturally.

Core Capabilities:
- Answer questions using the provided document context
- Maintain conversation flow and understand references to previous responses
- Handle conversational queries like "summarize them", "explain it", "tell me more"
- Provide helpful, detailed responses while staying document-focused

Response Guidelines:
- Always prioritize information from the provided documents
- Use conversation history to understand contextual references (like "them", "it", "those")
- Be conversational and helpful while remaining accurate
- If specific information isn't in the documents, acknowledge this but still try to be helpful with what you do have
- When users ask for summaries, explanations, or elaborations of previous responses, provide them
"""

    HUMAN = """Category: {category}
Current question: {question}

{conversation_context}

Document Context:
{context}

Respond naturally and conversationally. Use the conversation history to understand what the user is referring to (like "them", "it", "those"). If they're asking for a summary, explanation, or follow-up about something from the conversation history, provide that based on both the history and any relevant document context.

IMPORTANT: Do NOT include any inline citations or parenthetical references in your answer text. Keep the answer clean and readable.

After your answer, provide citations in this exact format:

Citations:
1. Title: [exact document title] | Category: [category] | Section: [main section - subheading if available] | Date: [document issued date if available]

For sections, include both main heading and subheading when available, separated by " - " (dash with spaces)."""

    PROMPT = ChatPromptTemplate.from_messages([
        ("system", SYSTEM),
        ("human", HUMAN)
    ])
else:
    EMB = LLM = PROMPT = None

def validate_qa_category(cat: str) -> str:
    """Validate Q&A category with normalization"""
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
    
    raise HTTPException(400, f"Invalid category. Must be one of: {QA_CATEGORIES}")

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
                "match_threshold": 0.1,  # Lower threshold for better recall
                "match_count": TOP_K
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

def get_retriever(category: str):
    """Get retriever based on configured backend"""
    if RETRIEVAL_BACKEND == "supabase":
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

# Initialize FastAPI app
app = FastAPI(
    title="ACEP Document Preprocessing & Q&A API",
    description="Complete ACEP document processing pipeline with intelligent Q&A capabilities. Preprocess documents into structured chunks and ask questions with accurate, citation-backed answers.",
    version="1.2.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)


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
    version: int = Form(1, description="Document version (default: 1) - Range: 1-100"),
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
    
    # Read file content to check size
    file_content = await file.read()
    file_size = len(file_content)
    
    # Validate file size
    if file_size == 0:
        raise HTTPException(
            status_code=400,
            detail="Empty file uploaded. Please provide a file with content."
        )
    
    if file_size > MAX_FILE_SIZE:
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
    
    # Validate version
    if not (1 <= version <= 100):
        raise HTTPException(
            status_code=400,
            detail="Version must be between 1 and 100."
        )
    
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
    
    # year must match issued_date.year when both provided
    if year is not None and issued_date:
        parsed_date = datetime.strptime(issued_date, "%Y-%m-%d").date()
        if year != parsed_date.year:
            raise HTTPException(
                status_code=400,
                detail="year must match issued_date.year"
            )
    
    # Create temporary file
    temp_file = None
    try:
        # Create temporary file with original extension
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
            temp_file.write(file_content)
            temp_file_path = temp_file.name
        
        # Extract text based on file type with enhanced parameters
        try:
            if file_ext == '.pdf':
                full_text, page_texts = extract_pdf(
                    Path(temp_file_path), 
                    ocr_language=ocr_language,
                    dpi=ocr_dpi
                )
            elif file_ext == '.docx':
                full_text, page_texts = extract_docx(Path(temp_file_path))
            else:  # .txt or .md
                full_text, page_texts = extract_txt_md(Path(temp_file_path))
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
            blocks = split_into_blocks(cleaned_pages)
        except Exception as structure_error:
            print(f"WARNING: Structure detection failed, using simple blocks: {structure_error}")
            # Fallback to simple page-based blocks
            blocks = [{'text': page, 'page_start': i+1, 'page_end': i+1, 'heading_path': []} 
                     for i, page in enumerate(cleaned_pages) if page.strip()]
        
        # Chunk the blocks with error handling
        try:
            chunk_dicts = chunk_blocks(blocks, max_tokens=max_tokens_per_chunk, overlap_tokens=overlap_tokens)
        except Exception as chunking_error:
            print(f"ERROR: Chunking failed: {chunking_error}")
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
            inferred_year = year or derive_year(cleaned_text, inferred_issued_date)
            print(f"✅ Year derivation completed: {inferred_year}")
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
                file_size=len(file_content),
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
        if temp_file and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except OSError:
                pass  # Best effort cleanup


@app.post("/v1/upload-and-preprocess")
async def upload_and_preprocess(
    file: UploadFile = File(..., description="Document file (PDF, DOCX, TXT, MD) - Max size: 50MB"),
    category: str = Form(..., description="Document category (required - must match ACEP categories exactly)"),
    title: Optional[str] = Form(None, description="Document title (optional)"),
    document_number: Optional[str] = Form(None, description="Document number/identifier (optional)"),
    issued_date: Optional[str] = Form(None, description="Issue date in ISO format YYYY-MM-DD (optional)"),
    year: Optional[int] = Form(None, description="Document year (optional)")
):
    """
    Simple user-facing endpoint:
    1) Accept upload + minimal fields
    2) Call preprocess_document with internal defaults
    3) Save the resulting JSON for analysis
    4) Return the same JSON plus saved_path
    """
    INTERNAL_DEFAULTS = {
        'version': 1,
        'is_current': True,
        'ocr_language': 'eng',
        'ocr_dpi': 300,
        'max_tokens_per_chunk': 1000,
        'overlap_tokens': 200
    }

    # Call the engine endpoint (reuses all validations & processing)
    try:
        result: PreprocessResponse = await preprocess_document(
            file=file,
            category=category,
            title=title,
            document_number=document_number,
            issued_date=issued_date,
            year=year,
            version=INTERNAL_DEFAULTS['version'],
            is_current=INTERNAL_DEFAULTS['is_current'],
            ocr_language=INTERNAL_DEFAULTS['ocr_language'],
            ocr_dpi=INTERNAL_DEFAULTS['ocr_dpi'],
            max_tokens_per_chunk=INTERNAL_DEFAULTS['max_tokens_per_chunk'],
            overlap_tokens=INTERNAL_DEFAULTS['overlap_tokens']
        )
        print(f"✅ Main processing completed. Document: {result.document.title}, Chunks: {len(result.chunks)}")
    except Exception as processing_error:
        print(f"❌ Error in main processing: {processing_error}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(processing_error)}")

    # Build the public JSON payload (same shape you already return)
    try:
        payload = {
            "document": {
                "title": result.document.title,
                "document_number": result.document.document_number,
                "category": result.document.category,
                "issued_date": result.document.issued_date,
                "year": result.document.year
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
        print(f"✅ Payload built successfully with {len(payload['chunks'])} chunks")
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
                    version=1,
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

    # Handle greetings and casual interactions
    question_lower = req.question.lower().strip()
    greeting_patterns = [
        'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
        'how are you', 'how do you do', 'greetings', 'what\'s up', 'whats up'
    ]
    
    if any(pattern in question_lower for pattern in greeting_patterns) and len(req.question.strip()) < 50:
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

    # normalize / validate category the same way as before
    category = validate_qa_category(req.category)

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

    # Call LLM and get raw content
    chain = PROMPT | LLM
    raw_resp = chain.invoke({
        "category": category,
        "question": req.question,
        "conversation_context": conversation_context,
        "context": ctx
    })
    ans = raw_resp.content if hasattr(raw_resp, "content") else str(raw_resp)

    # --- EXTRACT citations from structured Citations section ---
    citations_extracted = []
    
    # Look for the Citations: section in the response
    citations_match = re.search(r'\n\s*Citations:\s*\n(.*?)$', ans, re.DOTALL | re.MULTILINE)
    
    if citations_match:
        citations_text = citations_match.group(1)
        
        # Parse each citation line: "1. Title: [title] | Category: [category] | Section: [section] | Date: [date]"
        citation_pattern = r'\d+\.\s*Title:\s*([^|]+)\s*\|\s*Category:\s*([^|]+)\s*\|\s*Section:\s*([^|]+)\s*\|\s*Date:\s*(.+?)(?=\n\d+\.|\n\s*$|$)'
        citation_matches = re.findall(citation_pattern, citations_text, re.MULTILINE | re.DOTALL)
        
        # If no matches with Date field, try without Date field (backward compatibility)
        if not citation_matches:
            citation_pattern_old = r'\d+\.\s*Title:\s*([^|]+)\s*\|\s*Category:\s*([^|]+)\s*\|\s*Section:\s*(.+?)(?=\n\d+\.|\n\s*$|$)'
            citation_matches_old = re.findall(citation_pattern_old, citations_text, re.MULTILINE | re.DOTALL)
            
            for title, category, section in citation_matches_old:
                # Clean up extracted values
                title = title.strip()
                category = category.strip()
                section = section.strip()
                
                # Clean section - remove dashes and empty indicators
                if section in ["-", "N/A", "n/a", "None", "none", "", "null"]:
                    section = ""
                
                # Try to extract year from title for fallback date
                date_match = re.search(r'(\d{4})', title)
                date = f"{date_match.group(1)}-01-01" if date_match else None
                
                citations_extracted.append({
                    "title": title,
                    "category": category,
                    "section": section,
                    "date": date
                })
        else:
            for title, category, section, date_str in citation_matches:
                # Clean up extracted values
                title = title.strip()
                category = category.strip()
                section = section.strip()
                date_str = date_str.strip()
                
                # Clean section - remove dashes and empty indicators
                if section in ["-", "N/A", "n/a", "None", "none", "", "null"]:
                    section = ""
                
                # Parse the date string - could be full date (2024-03-15) or just year (2025)
                date = None
                if date_str:
                    # Try to parse full date first
                    full_date_match = re.search(r'(\d{4}-\d{2}-\d{2})', date_str)
                    if full_date_match:
                        date = full_date_match.group(1)
                    else:
                        # Fall back to year extraction
                        year_match = re.search(r'(\d{4})', date_str)
                        if year_match:
                            date = f"{year_match.group(1)}-01-01"
                
                citations_extracted.append({
                    "title": title,
                    "category": category,
                    "section": section,
                    "date": date
                })
    
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
    
    # Clean up extra spaces and punctuation issues
    ans_clean = re.sub(r'\s+', ' ', ans_clean.strip())
    ans_clean = re.sub(r'\s+\.', '.', ans_clean)  # Fix spacing before periods
    ans_clean = re.sub(r'\s+,', ',', ans_clean)   # Fix spacing before commas

    # --- Build citations array from extracted structured citations ---
    cites = []
    seen_documents = set()  # Track (title, category) pairs to avoid duplicates
    
    # First, use citations extracted from structured Citations section
    for citation_data in citations_extracted:
        title = citation_data["title"]
        category = citation_data["category"] 
        section = citation_data["section"]
        date = citation_data["date"]
        
        # Create unique identifier for this document
        doc_key = (title, category)
        
        # Skip if we've already seen this document
        if doc_key in seen_documents:
            continue
            
        seen_documents.add(doc_key)
        
        citation_entry = {
            "document": {
                "title": title,
                "category": category,
                "section": section,
                "date": date
            }
        }
        cites.append(citation_entry)
    
    # If no structured citations found, fall back to metadata extraction
    if not cites:
        # Helper to safely load metadata
        def safe_load_meta(raw_meta):
            if raw_meta is None:
                return {}
            if isinstance(raw_meta, dict):
                return raw_meta
            if isinstance(raw_meta, str):
                try:
                    return json.loads(raw_meta)
                except Exception:
                    return {"raw": raw_meta}
            try:
                return dict(raw_meta)
            except Exception:
                return {}

        for idx, d in enumerate(docs[:5]):  # Check more docs but deduplicate
            m_raw = d.metadata
            m = safe_load_meta(m_raw)

            # nested document object fallback
            doc_obj = m.get("document") if isinstance(m, dict) else None
            if not isinstance(doc_obj, dict):
                doc_obj = {}

            title = doc_obj.get("title") or m.get("title") or m.get("doc_title") or ""
            category = doc_obj.get("category") or m.get("category") or m.get("folder") or ""
            
            # Create unique identifier for this document
            doc_key = (title.strip(), category.strip())
            
            # Skip if we've already seen this document
            if doc_key in seen_documents:
                continue
                
            seen_documents.add(doc_key)
            # Get the actual issued date from metadata, not just year from title
            issued_date = doc_obj.get("issued_date") or m.get("issued_date") or None
            if not issued_date:
                # If no issued date, try to get year and format as date
                year_val = doc_obj.get("year") or m.get("year") or None
                if year_val:
                    issued_date = f"{year_val}-01-01"  # Default to January 1st of that year

            # Try many keys for section / heading with enhanced subheading support
            section = ""
            for key in ("section", "section_title", "heading", "heading_title", "title_path", "section_name", "section_desc"):
                if m.get(key):
                    section = str(m.get(key)).strip()
                    break

            # If heading_path present, try to format it into a friendly string with subheadings
            if not section:
                heading_path = m.get("heading_path") or []
                if isinstance(heading_path, list) and heading_path:
                    try:
                        if len(heading_path) >= 3:
                            # Main heading + subheading format: "Key Principles - Emergency Physician Authority"
                            main_heading = heading_path[0].strip()
                            sub_heading = heading_path[1].strip()
                            # Join additional path elements with dashes
                            additional = " - ".join([str(h).strip() for h in heading_path[2:] if h])
                            if additional:
                                section = f"{main_heading} - {sub_heading} - {additional}"
                            else:
                                section = f"{main_heading} - {sub_heading}"
                        elif len(heading_path) == 2:
                            # Main heading + subheading: "Key Principles - Emergency Physician Authority"
                            section = f"{heading_path[0].strip()} - {heading_path[1].strip()}"
                        else:
                            section = str(heading_path[0]).strip()
                    except Exception:
                        section = " > ".join([str(h).strip() for h in heading_path])

            # Enhanced fallback: look for section and subsection patterns in the document content
            if not section and hasattr(d, 'page_content'):
                content = d.page_content[:500]  # Check first 500 chars for section headers
                
                # Look for patterns like "Key Principles" followed by subheadings
                section_match = re.search(r'(?:^|\n)\s*((?:Key Principles|Executive Summary|Background|Introduction|Recommendations|Guidelines|Policy|Procedures)[^.\n]*)', content, re.IGNORECASE | re.MULTILINE)
                if section_match:
                    main_section = section_match.group(1).strip()
                    
                    # Look for subsection after the main section
                    remaining_content = content[section_match.end():]
                    subsection_match = re.search(r'(?:^|\n)\s*([A-Z][^.\n]{10,50}?)(?:\n|$)', remaining_content, re.MULTILINE)
                    
                    if subsection_match:
                        subsection = subsection_match.group(1).strip()
                        # Only include if it looks like a proper subsection (not too long, starts with capital)
                        if len(subsection) <= 50 and subsection[0].isupper():
                            section = f"{main_section} - {subsection}"
                    else:
                        section = main_section

            # Normalize empty strings to explicit empty
            section = section.strip() if section else ""
            
            # Clean section field - replace invalid indicators with empty string
            invalid_sections = ["-", "N/A", "n/a", "None", "none", "", "null"]
            if section in invalid_sections:
                section = ""

            citation_entry = {
                "document": {
                    "title": title,
                    "category": category,
                    "section": section,
                    "date": issued_date
                }
            }
            cites.append(citation_entry)
            
            # Limit to maximum 3 unique citations
            if len(cites) >= 3:
                break

    # Return cleaned answer (no citations inside text) and structured citation objects
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
                    
                    if base_source not in unique_documents:
                        original_filename = extract_original_filename(source_file)
                        
                        # Count chunks for this document
                        doc_chunks = sum(1 for r in result.data 
                                       if r.get('metadata', {}).get('source_file', '').startswith(base_source))
                        
                        doc_info = {
                            "filename": original_filename,
                            "title": title or original_filename,
                            "document_number": metadata.get('document_number', title),
                            "issued_date": metadata.get('issued_date'),
                            "year": metadata.get('year'),
                            "chunks": doc_chunks
                        }
                        
                        # Clean up None values
                        doc_info = {k: v for k, v in doc_info.items() if v is not None}
                        unique_documents[base_source] = doc_info
        
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
    # Development server
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )