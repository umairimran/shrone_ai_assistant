#!/usr/bin/env python3
"""
ACEP Document Embedding Pipeline - Phase 2

This script generates OpenAI embeddings for all processed document chunks 
and uploads them to category-specific Supabase tables using pgvector.

Features:
- Processes all JSON files from processed_output/ folders
- Generates embeddings using OpenAI text-embedding-3-large (3072 dimensions)
- Maps categories to appropriate Supabase tables
- Batch uploads for efficiency
- Progress tracking and error handling
- Deduplication using SHA256 chunk IDs

Usage:
    python generate_embeddings.py

Requirements:
    - OpenAI API key in environment variables
    - Supabase credentials configured
    - Tables created using supabase_functions.sql
"""

import os
import json
import hashlib
import time
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from datetime import datetime
import openai
from supabase import create_client, Client
import numpy as np
from tqdm import tqdm
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
PROCESSED_OUTPUT_DIR = Path("processed_output")
BATCH_SIZE = 50  # Process embeddings in batches
SUPABASE_BATCH_SIZE = 100  # Upload to Supabase in batches

# Category to table mapping
CATEGORY_TABLE_MAP = {
    "Board and Committee Proceedings": "vs_board_committees",
    "By-Laws & Governance Policies": "vs_bylaws", 
    "External Advocacy & Communications": "vs_external_advocacy",
    "Policy & Position Statements": "vs_policy_positions",
    "Resolutions": "vs_resolutions"
}

# Reverse mapping for folder names (slugified)
FOLDER_CATEGORY_MAP = {
    "Board_and_Committee_Proceedings": "Board and Committee Proceedings",
    "By-Laws_Governance_Policies": "By-Laws & Governance Policies",
    "External_Advocacy_Communications": "External Advocacy & Communications", 
    "Policy_Position_Statements": "Policy & Position Statements",
    "Resolutions": "Resolutions"
}

def setup_logging():
    """Set up logging for embedding process"""
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = log_dir / f"embedding_pipeline_{timestamp}.log"
    
    return log_file

def log_message(log_file: Path, message: str, print_also: bool = True):
    """Log message to file and optionally print"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}"
    
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(log_entry + "\n")
    
    if print_also:
        print(log_entry)

def setup_clients():
    """Initialize OpenAI and Supabase clients"""
    # OpenAI setup
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")
    
    openai.api_key = openai_api_key
    
    # Supabase setup
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")  # Changed from SUPABASE_ANON_KEY to SUPABASE_KEY
    
    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY environment variables must be set")
    
    supabase: Client = create_client(supabase_url, supabase_key)
    
    return supabase

def generate_chunk_id(text: str) -> str:
    """Generate SHA256 hash ID for chunk deduplication"""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def load_all_chunks() -> Dict[str, List[Dict]]:
    """
    Load all chunks from processed JSON files, organized by category.
    
    Returns:
        Dict mapping category names to lists of chunk dictionaries
    """
    chunks_by_category = {}
    
    for folder_path in PROCESSED_OUTPUT_DIR.iterdir():
        if folder_path.is_dir() and folder_path.name in FOLDER_CATEGORY_MAP:
            category = FOLDER_CATEGORY_MAP[folder_path.name]
            chunks_by_category[category] = []
            
            # Load all JSON files in this category folder
            for json_file in folder_path.glob("*.json"):
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        document_data = json.load(f)
                        
                    chunks = document_data.get('chunks', [])
                    for chunk in chunks:
                        # Add document metadata to each chunk
                        chunk_with_metadata = {
                            'content': chunk.get('text', ''),
                            'metadata': {
                                'document_title': document_data.get('title', ''),
                                'document_number': document_data.get('document_number', ''),
                                'category': document_data.get('category', ''),
                                'issued_date': document_data.get('issued_date', ''),
                                'year': document_data.get('year', ''),
                                'chunk_index': chunk.get('chunk_index', 0),
                                'tokens': chunk.get('tokens', 0),
                                'filename': json_file.name,
                                'source_file': document_data.get('source_file', ''),
                                'processing_timestamp': document_data.get('processing_timestamp', '')
                            }
                        }
                        chunks_by_category[category].append(chunk_with_metadata)
                        
                except Exception as e:
                    print(f"Error loading {json_file}: {e}")
                    continue
    
    return chunks_by_category

def generate_embeddings_batch(texts: List[str], log_file: Path) -> List[List[float]]:
    """Generate embeddings for a batch of texts using OpenAI"""
    try:
        response = openai.embeddings.create(
            input=texts,
            model="text-embedding-3-small"  # 1536 dimensions (fits Supabase HNSW limit)
        )
        
        embeddings = [embedding.embedding for embedding in response.data]
        return embeddings
        
    except Exception as e:
        log_message(log_file, f"❌ OpenAI API error: {e}")
        raise

def upload_to_supabase_batch(
    supabase: Client, 
    table_name: str, 
    chunks_with_embeddings: List[Dict],
    log_file: Path
) -> bool:
    """Upload a batch of chunks with embeddings to Supabase"""
    try:
        # Prepare data for Supabase
        rows = []
        for chunk_data in chunks_with_embeddings:
            chunk_id = generate_chunk_id(chunk_data['content'])
            row = {
                'id': chunk_id,
                'content': chunk_data['content'],
                'metadata': chunk_data['metadata'],
                'embedding': chunk_data['embedding']
            }
            rows.append(row)
        
        # Insert with upsert to handle duplicates
        result = supabase.table(table_name).upsert(rows).execute()
        
        if result.data:
            return True
        else:
            log_message(log_file, f"❌ Supabase upload failed for {table_name}")
            return False
            
    except Exception as e:
        log_message(log_file, f"❌ Supabase error for {table_name}: {e}")
        return False

def process_category_embeddings(
    category: str,
    chunks: List[Dict],
    supabase: Client,
    log_file: Path
) -> Tuple[int, int]:
    """
    Process embeddings for all chunks in a category.
    
    Returns:
        Tuple of (successful_count, failed_count)
    """
    table_name = CATEGORY_TABLE_MAP[category]
    total_chunks = len(chunks)
    successful_count = 0
    failed_count = 0
    
    log_message(log_file, f"\n🔄 Processing {category} → {table_name}")
    log_message(log_file, f"📊 Total chunks: {total_chunks}")
    
    # Process in batches for OpenAI API
    for i in tqdm(range(0, total_chunks, BATCH_SIZE), desc=f"Embedding {category}"):
        batch_end = min(i + BATCH_SIZE, total_chunks)
        batch_chunks = chunks[i:batch_end]
        
        # Extract texts for embedding
        texts = [chunk['content'] for chunk in batch_chunks]
        
        try:
            # Generate embeddings
            embeddings = generate_embeddings_batch(texts, log_file)
            
            # Add embeddings to chunk data
            chunks_with_embeddings = []
            for chunk, embedding in zip(batch_chunks, embeddings):
                chunk_copy = chunk.copy()
                chunk_copy['embedding'] = embedding
                chunks_with_embeddings.append(chunk_copy)
            
            # Upload to Supabase in smaller batches
            for j in range(0, len(chunks_with_embeddings), SUPABASE_BATCH_SIZE):
                supabase_batch_end = min(j + SUPABASE_BATCH_SIZE, len(chunks_with_embeddings))
                supabase_batch = chunks_with_embeddings[j:supabase_batch_end]
                
                success = upload_to_supabase_batch(supabase, table_name, supabase_batch, log_file)
                
                if success:
                    successful_count += len(supabase_batch)
                    log_message(log_file, f"  ✅ Uploaded batch {j//SUPABASE_BATCH_SIZE + 1}: {len(supabase_batch)} chunks")
                else:
                    failed_count += len(supabase_batch)
                    log_message(log_file, f"  ❌ Failed batch {j//SUPABASE_BATCH_SIZE + 1}: {len(supabase_batch)} chunks")
            
            # Rate limiting for OpenAI API
            time.sleep(0.5)
            
        except Exception as e:
            log_message(log_file, f"❌ Error processing batch {i//BATCH_SIZE + 1}: {e}")
            failed_count += len(batch_chunks)
            continue
    
    log_message(log_file, f"✅ {category} complete: {successful_count} successful, {failed_count} failed")
    return successful_count, failed_count

def main():
    """Main embedding pipeline function"""
    print("🚀 ACEP Document Embedding Pipeline - Phase 2")
    print("=" * 50)
    
    # Setup logging
    log_file = setup_logging()
    log_message(log_file, "Starting embedding pipeline")
    
    try:
        # Setup clients
        log_message(log_file, "🔧 Setting up OpenAI and Supabase clients...")
        supabase = setup_clients()
        log_message(log_file, "✅ Clients initialized successfully")
        
        # Load all chunks
        log_message(log_file, "📁 Loading processed chunks...")
        chunks_by_category = load_all_chunks()
        
        if not chunks_by_category:
            log_message(log_file, "❌ No processed chunks found")
            return
        
        # Summary
        total_chunks = sum(len(chunks) for chunks in chunks_by_category.values())
        log_message(log_file, f"📊 Loaded {total_chunks} chunks across {len(chunks_by_category)} categories:")
        
        for category, chunks in chunks_by_category.items():
            log_message(log_file, f"  • {category}: {len(chunks)} chunks")
        
        print(f"\n📝 Detailed logs: {log_file}")
        print("⏳ Starting embedding generation and upload...")
        
        # Process each category
        start_time = time.time()
        overall_successful = 0
        overall_failed = 0
        
        for category, chunks in chunks_by_category.items():
            successful, failed = process_category_embeddings(category, chunks, supabase, log_file)
            overall_successful += successful
            overall_failed += failed
        
        # Final summary
        end_time = time.time()
        duration = end_time - start_time
        
        log_message(log_file, f"\n📈 EMBEDDING PIPELINE COMPLETE")
        log_message(log_file, f"  • Total chunks processed: {overall_successful + overall_failed}")
        log_message(log_file, f"  • Successful uploads: {overall_successful}")
        log_message(log_file, f"  • Failed uploads: {overall_failed}")
        log_message(log_file, f"  • Success rate: {(overall_successful/(overall_successful + overall_failed))*100:.1f}%")
        log_message(log_file, f"  • Duration: {duration:.1f} seconds")
        log_message(log_file, f"  • Average: {duration/total_chunks:.2f} seconds per chunk")
        
        print(f"\n📊 Results:")
        print(f"  • Successful: {overall_successful}/{total_chunks} chunks")
        print(f"  • Success rate: {(overall_successful/total_chunks)*100:.1f}%")
        print(f"📝 Full log: {log_file}")
        
        if overall_failed > 0:
            print(f"\n⚠️  {overall_failed} chunks failed - check logs for details")
        else:
            print(f"\n🎉 All {overall_successful} chunks embedded and uploaded successfully!")
            
    except Exception as e:
        log_message(log_file, f"❌ Fatal error: {e}")
        print(f"❌ Error: {e}")
        print(f"📝 Check logs: {log_file}")

if __name__ == "__main__":
    main()