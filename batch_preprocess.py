#!/usr/bin/env python3
"""
Batch Document Preprocessing Script for ACEP Documents

This script processes all document files in the documents/ folder structure:
- Reads documents from documents/{category}/ subfolders
- Supports PDF, Word (.doc/.docx), text (.txt), and RTF files
- Calls the local preprocessing API for each document
- Saves JSON outputs to processed_output/{category}/
- Provides progress tracking and error handling

Usage:
    python batch_preprocess.py

Requirements:
    - FastAPI server running on localhost:8000
    - Documents organized in documents/{category}/ subfolders
"""

import os
import json
import time
import requests
from pathlib import Path
from typing import Dict, List, Tuple
from datetime import datetime

# Configuration
API_BASE_URL = "http://localhost:8000"
DOCUMENTS_DIR = Path("documents")
OUTPUT_DIR = Path("processed_output")
BATCH_SIZE = 1  # Process one at a time for better error tracking

# Valid ACEP categories (must match exactly)
VALID_CATEGORIES = {
    "Resolutions",
    "By-Laws & Governance Policies", 
    "Board and Committee Proceedings",
    "Policy & Position Statements",
    "External Advocacy &  Communications"
}

def setup_logging():
    """Set up logging for batch processing"""
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = log_dir / f"batch_preprocess_{timestamp}.log"
    
    return log_file

def log_message(log_file: Path, message: str, print_also: bool = True):
    """Log message to file and optionally print"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}"
    
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(log_entry + "\n")
    
    if print_also:
        print(log_entry)

def discover_document_files() -> Dict[str, List[Path]]:
    """
    Discover all document files organized by category folder.
    Supports PDF, Word documents, and text files.
    
    Returns:
        Dict mapping category names to list of document file paths
    """
    files_by_category = {}
    
    # Supported file extensions
    supported_extensions = ["*.pdf", "*.doc", "*.docx", "*.txt", "*.rtf"]
    
    for category_dir in DOCUMENTS_DIR.iterdir():
        if category_dir.is_dir() and category_dir.name in VALID_CATEGORIES:
            category = category_dir.name
            document_files = []
            
            # Collect all supported file types
            for pattern in supported_extensions:
                document_files.extend(category_dir.glob(pattern))
            
            if document_files:
                files_by_category[category] = sorted(document_files)  # Sort for consistent order
    
    return files_by_category

def infer_metadata_from_filename(filepath: Path, category: str) -> Tuple[str, str, str, str]:
    """
    Infer document metadata from filename and path.
    Handles document number length limit and future date validation.
    
    Args:
        filepath: Path to the PDF file
        category: Document category
        
    Returns:
        Tuple of (title, document_number, issued_date, year)
    """
    filename = filepath.stem  # Remove file extension
    
    # Use filename as title (cleaned)
    title = filename.replace("_", " ").replace("-", " ").strip()
    
    # Try to extract year from filename, but cap at current year (2025)
    year = "2024"  # Default
    current_year = 2025
    
    for part in filename.split():
        if part.isdigit() and len(part) == 4 and part.startswith("20"):
            extracted_year = int(part)
            if extracted_year <= current_year:  # Don't allow future years
                year = str(extracted_year)
            else:
                year = str(current_year)  # Cap at current year
            break
    
    # Create document number from filename, but limit to 50 characters
    document_number = filename
    if len(document_number) > 50:
        # Truncate to 47 chars and add "..." to indicate truncation
        document_number = document_number[:47] + "..."
    
    # Default issued date based on year
    issued_date = f"{year}-01-01"
    
    return title, document_number, issued_date, year

def get_mime_type(filepath: Path) -> str:
    """Get appropriate MIME type based on file extension"""
    extension = filepath.suffix.lower()
    mime_types = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
        '.rtf': 'application/rtf'
    }
    return mime_types.get(extension, 'application/octet-stream')

def process_single_document(filepath: Path, category: str, log_file: Path) -> bool:
    """
    Process a single document through the preprocessing API.
    Supports PDF, Word documents, and text files.
    
    Args:
        filepath: Path to document file
        category: Document category
        log_file: Log file path
        
    Returns:
        True if successful, False otherwise
    """
    try:
        log_message(log_file, f"Processing: {filepath.name}")
        
        # Infer metadata
        title, document_number, issued_date, year = infer_metadata_from_filename(filepath, category)
        
        # Get appropriate MIME type
        mime_type = get_mime_type(filepath)
        
        # Prepare API request
        url = f"{API_BASE_URL}/v1/upload-and-preprocess"
        
        with open(filepath, 'rb') as file:
            files = {'file': (filepath.name, file, mime_type)}
            data = {
                'title': title,
                'document_number': document_number,
                'category': category,
                'issued_date': issued_date,
                'year': year
            }
            
            log_message(log_file, f"  → Title: {title}")
            log_message(log_file, f"  → Category: {category}")
            log_message(log_file, f"  → File Type: {filepath.suffix}")
            log_message(log_file, f"  → Year: {year}")
            
            # Make API call
            response = requests.post(url, files=files, data=data, timeout=300)
            
            if response.status_code == 200:
                result = response.json()
                chunk_count = len(result.get('chunks', []))
                log_message(log_file, f"  ✅ Success: {chunk_count} chunks created")
                return True
            else:
                log_message(log_file, f"  ❌ API Error {response.status_code}: {response.text}")
                return False
                
    except requests.exceptions.Timeout:
        log_message(log_file, f"  ❌ Timeout error for {filepath.name}")
        return False
    except requests.exceptions.RequestException as e:
        log_message(log_file, f"  ❌ Request error: {e}")
        return False
    except Exception as e:
        log_message(log_file, f"  ❌ Unexpected error: {e}")
        return False

def check_api_health() -> bool:
    """Check if the preprocessing API is running"""
    try:
        response = requests.get(f"{API_BASE_URL}/health", timeout=5)
        return response.status_code == 200
    except:
        return False

def main():
    """Main batch processing function"""
    print("🚀 ACEP Document Batch Preprocessing Script")
    print("=" * 50)
    
    # Setup logging
    log_file = setup_logging()
    log_message(log_file, "Starting batch preprocessing")
    
    # Check API health
    if not check_api_health():
        log_message(log_file, "❌ API health check failed. Make sure FastAPI server is running on localhost:8000")
        print("\n💡 Start the API server with: uvicorn main:app --reload")
        return
    
    log_message(log_file, "✅ API health check passed")
    
    # Discover files
    files_by_category = discover_document_files()
    
    if not files_by_category:
        log_message(log_file, "❌ No document files found in documents/ subfolders")
        return
    
    # Print summary
    total_files = sum(len(files) for files in files_by_category.values())
    log_message(log_file, f"📊 Found {total_files} document files across {len(files_by_category)} categories:")
    
    for category, files in files_by_category.items():
        log_message(log_file, f"  • {category}: {len(files)} files")
    
    print(f"\n📝 Detailed logs: {log_file}")
    print("\n⏳ Starting processing...")
    
    # Process files
    start_time = time.time()
    total_processed = 0
    total_success = 0
    total_failed = 0
    
    for category, files in files_by_category.items():
        log_message(log_file, f"\n📁 Processing category: {category}")
        
        for i, filepath in enumerate(files, 1):
            log_message(log_file, f"[{i}/{len(files)}] Processing {filepath.name}")
            
            success = process_single_document(filepath, category, log_file)
            total_processed += 1
            
            if success:
                total_success += 1
            else:
                total_failed += 1
            
            # Progress update
            progress = (total_processed / total_files) * 100
            print(f"Progress: {progress:.1f}% ({total_processed}/{total_files})")
            
            # Small delay to avoid overwhelming the API
            time.sleep(0.5)
    
    # Final summary
    end_time = time.time()
    duration = end_time - start_time
    
    log_message(log_file, f"\n📈 BATCH PROCESSING COMPLETE")
    log_message(log_file, f"  • Total files: {total_files}")
    log_message(log_file, f"  • Successful: {total_success}")
    log_message(log_file, f"  • Failed: {total_failed}")
    log_message(log_file, f"  • Duration: {duration:.1f} seconds")
    log_message(log_file, f"  • Average: {duration/total_files:.1f} seconds per file")
    
    print(f"\n🎯 Results saved to: {OUTPUT_DIR}")
    print(f"📝 Full log: {log_file}")
    
    if total_failed > 0:
        print(f"\n⚠️  {total_failed} files failed - check logs for details")
    else:
        print(f"\n🎉 All {total_success} documents processed successfully!")

if __name__ == "__main__":
    main()