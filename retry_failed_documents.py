#!/usr/bin/env python3
"""
Retry Failed Documents Script

This script reprocesses only the documents that failed in the previous batch run.
It uses the improved metadata inference with proper length limits and date validation.

Usage:
    python retry_failed_documents.py

Requirements:
    - FastAPI server running on localhost:8000
    - Updated batch_preprocess.py with fixes
"""

import os
import json
import time
import requests
from pathlib import Path
from datetime import datetime
from batch_preprocess import (
    API_BASE_URL, 
    DOCUMENTS_DIR, 
    log_message,
    setup_logging,
    check_api_health,
    infer_metadata_from_filename,
    get_mime_type
)

# List of documents that failed in the previous run
FAILED_DOCUMENTS = [
    # Document number too long (12 files)
    ("Board and Committee Proceedings", "ES 5-16-25 Special BOD Virtual Meeting Minutes - June BOD Mtg.pdf"),
    ("Board and Committee Proceedings", "September 4 2025 Board Meeting Materials - NON-Confidential.pdf"),
    ("Policy & Position Statements", "Specialty Consult Time and Documentation Expectations _ ACEP.pdf"),
    ("Policy & Position Statements", "Treating Physician Determines Patient Stability _ ACEP.pdf"),
    ("Policy & Position Statements", "specialty-consult-time-and-documentation-expectations.pdf"),
    ("Resolutions", "2025 Resolutions Adopted by the Council and Board of Directors.docx"),
    ("External Advocacy &  Communications", "ACEP Announces New Policy Statement on Corporate Practice of Medicine _ ACEP.pdf"),
    ("External Advocacy &  Communications", "ACEP Reaffirms Support for Banning Noncompete Agreements in Health Care.pdf"),
    ("External Advocacy &  Communications", "Emergency Physicians Strongly Support the No Surprises Enforcement Act.pdf"),
    ("External Advocacy &  Communications", "Emergency Physicians_ Everyone Should Learn the Signs of Suicide Risk.pdf"),
    ("External Advocacy &  Communications", "Leading Physician Organizations Say Turmoil at the CDC Puts Lives at Risk.pdf"),
    ("External Advocacy &  Communications", "Tylenol is Safe and Effective for Pregnant Patients.pdf"),
    
    # Future date error (2 files)
    ("External Advocacy &  Communications", "ACEP Response to CY 2026 OPPS Proposed Rule.pdf"),
    ("External Advocacy &  Communications", "ACEP Response to CY 2026 PFS Proposed Rule.pdf"),
]

def process_single_document(filepath: Path, category: str, log_file: Path) -> bool:
    """
    Process a single document through the preprocessing API.
    Uses the improved metadata inference with fixes.
    
    Args:
        filepath: Path to document file
        category: Document category
        log_file: Log file path
        
    Returns:
        True if successful, False otherwise
    """
    try:
        log_message(log_file, f"🔄 Retrying: {filepath.name}")
        
        # Infer metadata (now with fixes)
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
            log_message(log_file, f"  → Document Number: {document_number} (length: {len(document_number)})")
            log_message(log_file, f"  → Year: {year}")
            log_message(log_file, f"  → Issued Date: {issued_date}")
            
            # Make API call
            response = requests.post(url, files=files, data=data, timeout=300)
            
            if response.status_code == 200:
                result = response.json()
                chunk_count = len(result.get('chunks', []))
                log_message(log_file, f"  ✅ SUCCESS: {chunk_count} chunks created")
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

def main():
    """Main retry processing function"""
    print("🔄 ACEP Failed Documents Retry Script")
    print("=" * 40)
    
    # Setup logging
    log_file = setup_logging()
    log_file = log_file.parent / log_file.name.replace("batch_preprocess", "retry_failed")
    log_message(log_file, "Starting retry of failed documents")
    
    # Check API health
    if not check_api_health():
        log_message(log_file, "❌ API health check failed. Make sure FastAPI server is running on localhost:8000")
        print("\n💡 Start the API server with: uvicorn main:app --reload")
        return
    
    log_message(log_file, "✅ API health check passed")
    
    # Validate failed documents exist
    existing_files = []
    missing_files = []
    
    for category, filename in FAILED_DOCUMENTS:
        filepath = DOCUMENTS_DIR / category / filename
        if filepath.exists():
            existing_files.append((category, filepath))
        else:
            missing_files.append((category, filename))
    
    if missing_files:
        log_message(log_file, f"⚠️  Missing files:")
        for category, filename in missing_files:
            log_message(log_file, f"  • {category}/{filename}")
    
    if not existing_files:
        log_message(log_file, "❌ No failed documents found to retry")
        return
    
    log_message(log_file, f"📊 Found {len(existing_files)} failed documents to retry:")
    for category, filepath in existing_files:
        log_message(log_file, f"  • {category}/{filepath.name}")
    
    print(f"\n📝 Detailed logs: {log_file}")
    print(f"⏳ Retrying {len(existing_files)} failed documents...")
    
    # Process failed files
    start_time = time.time()
    total_processed = 0
    total_success = 0
    total_failed = 0
    
    for category, filepath in existing_files:
        log_message(log_file, f"\n[{total_processed + 1}/{len(existing_files)}] Processing {category}/{filepath.name}")
        
        success = process_single_document(filepath, category, log_file)
        total_processed += 1
        
        if success:
            total_success += 1
        else:
            total_failed += 1
        
        # Progress update
        progress = (total_processed / len(existing_files)) * 100
        print(f"Progress: {progress:.1f}% ({total_processed}/{len(existing_files)})")
        
        # Small delay to avoid overwhelming the API
        time.sleep(0.5)
    
    # Final summary
    end_time = time.time()
    duration = end_time - start_time
    
    log_message(log_file, f"\n📈 RETRY PROCESSING COMPLETE")
    log_message(log_file, f"  • Total retried: {total_processed}")
    log_message(log_file, f"  • Successful: {total_success}")
    log_message(log_file, f"  • Still failed: {total_failed}")
    log_message(log_file, f"  • Duration: {duration:.1f} seconds")
    log_message(log_file, f"  • Average: {duration/total_processed:.1f} seconds per file")
    
    print(f"\n📝 Full log: {log_file}")
    
    if total_failed > 0:
        print(f"\n⚠️  {total_failed} files still failed - check logs for details")
    else:
        print(f"\n🎉 All {total_success} previously failed documents now processed successfully!")
        
    # Combined summary
    print(f"\n📊 OVERALL STATUS:")
    print(f"  • Original successful: 20 documents")
    print(f"  • Retry successful: {total_success} documents")
    print(f"  • Total successful: {20 + total_success} documents")
    print(f"  • Still failing: {total_failed} documents")
    print(f"  • Overall success rate: {((20 + total_success) / 34) * 100:.1f}%")

if __name__ == "__main__":
    main()