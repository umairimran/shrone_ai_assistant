"""
Build Embeddings Script - Phase 3 Implementation

This script implements the exact Phase 3 specification for building embeddings
with both local FAISS indexes and Supabase storage using LangChain.

Features:
- Reads from processed_output/ folders
- Normalizes category names
- Computes OpenAI embeddings via LangChain
- Writes to local FAISS (one dir per category)
- Upserts to Supabase tables
- Idempotent via chunk_id = sha256(text)
"""

import os
import json
import glob
import hashlib
import argparse
import shutil
from pathlib import Path
from collections import defaultdict
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from supabase import create_client
from embeddings_config import CATEGORY_MAP, SUPABASE_TABLE_BY_CATEGORY, OPENAI_EMBED_MODEL, BATCH_SIZE

# Configuration
JSON_ROOT = Path("processed_output")
LOCAL_ROOT = Path("indexes_local")
LOCAL_ROOT.mkdir(parents=True, exist_ok=True)

def sha256_text(t: str) -> str:
    """Generate SHA256 hash of text for idempotent chunk IDs"""
    return hashlib.sha256(t.encode("utf-8")).hexdigest()

def normalize_category(folder_name: str) -> str:
    """Normalize folder names to canonical category names"""
    return CATEGORY_MAP.get(folder_name, folder_name)

def load_docs_per_category():
    """
    Load all documents from processed_output/ folders and organize by category.
    
    Returns:
        dict: Category name -> list of LangChain Documents
    """
    buckets = defaultdict(list)
    
    for folder in JSON_ROOT.iterdir():
        if not folder.is_dir():
            continue
            
        cat = normalize_category(folder.name)
        print(f"Processing folder: {folder.name} -> {cat}")
        
        for jf in folder.glob("*.json"):
            try:
                data = json.loads(jf.read_text(encoding="utf-8"))
                meta_doc = data.get("document", {})
                
                for ch in data.get("chunks", []):
                    text = (ch.get("text") or "").strip()
                    if not text:
                        continue
                        
                    cid = sha256_text(text)
                    
                    # Build metadata following the spec structure
                    md = {
                        "id": cid,
                        "text_hash": cid,
                        "title": meta_doc.get("title") or "",
                        "document_number": meta_doc.get("document_number") or "",
                        "category": cat,
                        "issued_date": meta_doc.get("issued_date"),
                        "year": meta_doc.get("year"),
                        "page_start": ch.get("page_start"),
                        "page_end": ch.get("page_end"),
                        "heading_path": " > ".join(ch.get("heading_path") or []),
                        "chunk_index": ch.get("chunk_index"),
                        "source_file": data.get("saved_path") or jf.name,
                        "doc_version": 1,
                        "is_current": True
                    }
                    
                    buckets[cat].append(Document(page_content=text, metadata=md))
                    
            except Exception as e:
                print(f"Error processing {jf}: {e}")
                continue
    
    return buckets

def build_local_faiss(category: str, docs: list[Document], embedder, rebuild=False):
    """
    Build local FAISS index for a category.
    
    Args:
        category: Category name
        docs: List of LangChain Documents
        embedder: LangChain embeddings instance
        rebuild: Whether to rebuild from scratch
        
    Returns:
        str: Path to the created FAISS index
    """
    out_dir = LOCAL_ROOT / category
    
    if rebuild and out_dir.exists():
        print(f"  Rebuilding local FAISS: removing {out_dir}")
        shutil.rmtree(out_dir)
    
    print(f"  Creating FAISS index with {len(docs)} documents...")
    
    # Process in smaller batches to avoid token limits  
    chunk_size = 30 if len(docs) > 300 else 50  # Even smaller for large categories
    first_batch = True
    vs = None
    
    for i in range(0, len(docs), chunk_size):
        batch_docs = docs[i:i+chunk_size]
        print(f"    Processing batch {i//chunk_size + 1}/{(len(docs)-1)//chunk_size + 1} ({len(batch_docs)} docs)")
        
        try:
            if first_batch:
                vs = FAISS.from_documents(batch_docs, embedder)
                first_batch = False
            else:
                # Add to existing index
                batch_vs = FAISS.from_documents(batch_docs, embedder)
                vs.merge_from(batch_vs)
        except Exception as e:
            print(f"    Error with batch {i//chunk_size + 1}: {e}")
            # Try with mini-batches of 10
            mini_size = 10
            for j in range(i, min(i + chunk_size, len(docs)), mini_size):
                mini_batch = docs[j:j + mini_size]
                try:
                    if first_batch:
                        vs = FAISS.from_documents(mini_batch, embedder)
                        first_batch = False
                        print(f"      Mini-batch 1: {len(mini_batch)} docs")
                    else:
                        mini_vs = FAISS.from_documents(mini_batch, embedder)
                        vs.merge_from(mini_vs)
                        print(f"      Mini-batch {(j-i)//mini_size + 1}: {len(mini_batch)} docs")
                except Exception as e2:
                    print(f"      Failed mini-batch: {e2}")
                    continue
    
    vs.save_local(str(out_dir))
    return str(out_dir)

def upsert_supabase(category: str, docs: list[Document], embedder, rebuild=False):
    """
    Upsert documents to Supabase table for a category.
    
    Args:
        category: Category name
        docs: List of LangChain Documents
        embedder: LangChain embeddings instance
        rebuild: Whether to truncate table first
        
    Returns:
        str: Table name that was updated
    """
    # Use service key for admin operations as specified
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
    
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY (or SUPABASE_KEY)")
    
    client = create_client(url, key)
    table = SUPABASE_TABLE_BY_CATEGORY[category]
    
    if rebuild:
        print(f"  Rebuilding Supabase: truncating {table}")
        # Truncate table by deleting all rows
        client.table(table).delete().neq("id", "__never__").execute()
    
    # Process in batches for efficiency
    B = BATCH_SIZE
    texts = [d.page_content for d in docs]
    metas = [d.metadata for d in docs]
    
    print(f"  Generating embeddings and upserting to {table}...")
    
    for i in range(0, len(texts), B):
        batch_texts = texts[i:i+B]
        batch_metas = metas[i:i+B]
        
        # Deduplicate within batch to avoid constraint violations
        seen_ids = set()
        unique_texts = []
        unique_metas = []
        
        for j, meta in enumerate(batch_metas):
            if meta["id"] not in seen_ids:
                seen_ids.add(meta["id"])
                unique_texts.append(batch_texts[j])
                unique_metas.append(meta)
        
        if not unique_texts:
            print(f"    Batch {i//B + 1}: Skipped (all duplicates)")
            continue
        
        # Generate embeddings for unique texts only
        embs = embedder.embed_documents(unique_texts)
        
        # Prepare rows for upsert
        rows = []
        for j, emb in enumerate(embs):
            md = unique_metas[j]
            rows.append({
                "id": md["id"],
                "content": unique_texts[j],
                "metadata": md,
                "embedding": emb
            })
        
        # Upsert to Supabase (handles conflicts by replacing on PK)
        try:
            result = client.table(table).upsert(rows).execute()
            print(f"    Batch {i//B + 1}: Upserted {len(rows)} unique rows (from {len(batch_texts)} total)")
        except Exception as e:
            print(f"    Batch {i//B + 1}: Error upserting: {e}")
            raise
    
    return table

def main():
    """Main CLI function following the Phase 3 specification"""
    ap = argparse.ArgumentParser(description="Build embeddings for ACEP documents")
    ap.add_argument("--targets", nargs="+", default=["local", "supabase"], 
                   choices=["local", "supabase"],
                   help="Target stores to build (default: both)")
    ap.add_argument("--categories", nargs="*",
                   help="Optional filter list of categories to process")
    ap.add_argument("--rebuild", action="store_true",
                   help="Rebuild from scratch (wipe existing data)")
    args = ap.parse_args()

    # Initialize OpenAI embeddings via LangChain
    print(f"Initializing OpenAI embeddings with model: {OPENAI_EMBED_MODEL}")
    embedder = OpenAIEmbeddings(model=OPENAI_EMBED_MODEL)
    
    # Load documents organized by category
    print("Loading documents from processed_output/...")
    buckets = load_docs_per_category()
    
    # Apply category filter if specified
    if args.categories:
        print(f"Filtering to categories: {args.categories}")
        buckets = {k: v for k, v in buckets.items() if k in set(args.categories)}

    if not buckets:
        raise SystemExit("No documents found in processed_output/")

    # Display summary
    total_docs = sum(len(docs) for docs in buckets.values())
    print(f"\nProcessing {total_docs} documents across {len(buckets)} categories:")
    for cat, docs in buckets.items():
        print(f"  {cat}: {len(docs)} chunks")
    
    print(f"\nTargets: {args.targets}")
    print(f"Rebuild: {args.rebuild}")
    print()

    # Process each category
    for cat, docs in buckets.items():
        print(f"== {cat} ({len(docs)} chunks) ==")
        
        if "local" in args.targets:
            try:
                path = build_local_faiss(cat, docs, embedder, rebuild=args.rebuild)
                print(f"  [local] saved → {path}")
            except Exception as e:
                print(f"  [local] ERROR: {e}")
        
        if "supabase" in args.targets:
            try:
                table = upsert_supabase(cat, docs, embedder, rebuild=args.rebuild)
                print(f"  [supabase] upserted → {table}")
            except Exception as e:
                print(f"  [supabase] ERROR: {e}")
        
        print()

    print("✅ Build embeddings complete!")

if __name__ == "__main__":
    main()