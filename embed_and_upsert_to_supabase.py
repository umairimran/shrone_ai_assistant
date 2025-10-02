#!/usr/bin/env python3
# encoding: utf-8
"""
embed_and_upsert_to_supabase.py

- Reads per-folder JSON (preprocessed_output/*.json)
- Embeds each chunk using SentenceTransformer
- Upserts to Supabase table `documents` (embedding column must be pgvector)
- Marks chunks.status = 'embedded' in manifest.db (so you don't re-embed)
"""

import os
import json
import time
import argparse
import logging
import sqlite3
from pathlib import Path
from typing import List, Dict, Optional

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()  # Load .env file if it exists
except ImportError:
    # dotenv not installed, skip loading .env file
    pass

# Embedding model
from sentence_transformers import SentenceTransformer
import numpy as np

# Supabase client
from supabase import create_client, Client

# ---------------- CONFIG ----------------
OUTPUT_DIR = Path("./preprocessed_output")
MANIFEST_DB = OUTPUT_DIR / "manifest.db"
EMBED_BATCH_SIZE = 128
EMB_MODEL = "all-MiniLM-L6-v2"  # change if you prefer a different SentenceTransformer model
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SUPABASE_TABLE = "documents"  # table name in Supabase/pgvector

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("embed_upsert")

# ---------------- Helpers ----------------
def init_supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_KEY environment variables before running.")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def read_json(path: Path) -> List[Dict]:
    """Read JSON file containing an array of chunk objects."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            items = json.load(f)
        if not isinstance(items, list):
            logger.warning("JSON file %s does not contain an array", path)
            return []
        return items
    except Exception as e:
        logger.error("Error reading JSON file %s: %s", path, e)
        return []

def mark_chunk_embedded(db_path: Path, text_hash: str):
    conn = sqlite3.connect(str(db_path))
    c = conn.cursor()
    now = time.time()
    try:
        c.execute("UPDATE chunks SET status = ?, updated_at = ? WHERE text_hash = ?", ("embedded", now, text_hash))
        conn.commit()
    except Exception as e:
        logger.warning("Failed to update chunk status for %s: %s", text_hash, e)
    finally:
        conn.close()

def load_manifest_db_check(db_path: Path):
    # check db exists
    if not db_path.exists():
        raise FileNotFoundError(f"Manifest DB not found at {db_path}. Run preprocessing first.")
    # quick sanity: ensure chunks table exists
    conn = sqlite3.connect(str(db_path))
    c = conn.cursor()
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks'")
    if not c.fetchone():
        conn.close()
        raise RuntimeError("chunks table not found in manifest DB. Ensure you are using the corrected pipeline.")
    conn.close()

# ---------------- Upsert helper ----------------
def upsert_batch_to_supabase(supabase: Client, rows: List[Dict]):
    """
    Upsert a batch of rows to Supabase.
    Each row must include an 'embedding' list of floats.
    """
    if not rows:
        return
    # Supabase Python client uses .table(...).upsert([...]).execute()
    # We'll upsert with chunk_id as unique identifier (assume the table has unique constraint)
    try:
        resp = supabase.table(SUPABASE_TABLE).upsert(rows).execute()
        # resp may contain errors — log it for debugging
        if resp and isinstance(resp, dict) and resp.get("error"):
            logger.warning("Supabase upsert returned error: %s", resp.get("error"))
    except Exception as e:
        logger.exception("Supabase upsert exception: %s", e)
        raise

# ---------------- Main flow ----------------
def run_embed_and_upsert(model_name: str, batch_size: int = EMBED_BATCH_SIZE, dry_run: bool = False):
    # 1) load embedding model
    logger.info("Loading embedding model: %s", model_name)
    model = SentenceTransformer(model_name)

    # 2) init supabase client
    supabase = init_supabase_client()

    # 3) check manifest DB
    load_manifest_db_check(MANIFEST_DB)

    # 4) gather json files
    json_files = sorted(OUTPUT_DIR.glob("*.json"))
    if not json_files:
        logger.info("No JSON files found in %s", OUTPUT_DIR)
        return

    total_upserted = 0
    for js in json_files:
        logger.info("Processing file: %s", js)
        records = read_json(js)
        logger.info("Found %d records in %s", len(records), js.name)

        # batch through records
        batch_rows = []
        texts_to_embed = []
        recs_for_batch = []

        for rec in records:
            # skip if already embedded in chunks table
            text_hash = rec.get("text_hash")
            if not text_hash:
                logger.debug("Record missing text_hash, skipping")
                continue

            # check chunks table status to avoid re-embedding (quick DB check)
            conn = sqlite3.connect(str(MANIFEST_DB))
            c = conn.cursor()
            c.execute("SELECT status FROM chunks WHERE text_hash = ?", (text_hash,))
            row = c.fetchone()
            conn.close()
            if row and row[0] == "embedded":
                logger.debug("Skipping already embedded chunk %s", text_hash)
                continue

            # collect for embedding
            texts_to_embed.append(rec.get("text", "")[:32000])  # safety: max length cap
            recs_for_batch.append(rec)

            # when batch full, compute embeddings and upsert
            if len(texts_to_embed) >= batch_size:
                logger.info("Embedding batch of size %d", len(texts_to_embed))
                embs = model.encode(texts_to_embed, batch_size=64, show_progress_bar=False, convert_to_numpy=True)
                # convert to list of floats
                for rec_item, emb in zip(recs_for_batch, embs):
                    # build Supabase row
                    row = {
                        "chunk_id": rec_item.get("chunk_id"),
                        "doc_id": rec_item.get("doc_id"),
                        "doc_title": rec_item.get("doc_title"),
                        "category": rec_item.get("category"),
                        "folder": rec_item.get("folder"),
                        "source_path": rec_item.get("source_path"),
                        "page_start": rec_item.get("page_start"),
                        "page_end": rec_item.get("page_end"),
                        "char_start": rec_item.get("char_start"),
                        "char_end": rec_item.get("char_end"),
                        "text": rec_item.get("text"),
                        "n_tokens": int(rec_item.get("n_tokens", 0)),
                        "text_hash": rec_item.get("text_hash"),
                        "version": rec_item.get("version"),
                        "created_at": rec_item.get("created_at"),
                        "encoding": rec_item.get("encoding", "utf-8"),
                        "date": rec_item.get("date"),
                        "embedding": emb.tolist() if isinstance(emb, (np.ndarray,)) else list(map(float, emb))
                    }
                    batch_rows.append(row)

                # upsert
                if dry_run:
                    logger.info("Dry-run mode: would upsert %d rows", len(batch_rows))
                else:
                    upsert_batch_to_supabase(supabase, batch_rows)
                    # mark chunks embedded
                    for rec_item in recs_for_batch:
                        mark_chunk_embedded(MANIFEST_DB, rec_item.get("text_hash"))

                total_upserted += len(batch_rows)
                batch_rows = []
                texts_to_embed = []
                recs_for_batch = []
                # short sleep to avoid bursts
                time.sleep(0.1)

        # final partial batch
        if texts_to_embed:
            logger.info("Embedding final batch of size %d", len(texts_to_embed))
            embs = model.encode(texts_to_embed, batch_size=64, show_progress_bar=False, convert_to_numpy=True)
            for rec_item, emb in zip(recs_for_batch, embs):
                row = {
                    "chunk_id": rec_item.get("chunk_id"),
                    "doc_id": rec_item.get("doc_id"),
                    "doc_title": rec_item.get("doc_title"),
                    "category": rec_item.get("category"),
                    "folder": rec_item.get("folder"),
                    "source_path": rec_item.get("source_path"),
                    "page_start": rec_item.get("page_start"),
                    "page_end": rec_item.get("page_end"),
                    "char_start": rec_item.get("char_start"),
                    "char_end": rec_item.get("char_end"),
                    "text": rec_item.get("text"),
                    "n_tokens": int(rec_item.get("n_tokens", 0)),
                    "text_hash": rec_item.get("text_hash"),
                    "version": rec_item.get("version"),
                    "created_at": rec_item.get("created_at"),
                    "encoding": rec_item.get("encoding", "utf-8"),
                    "date": rec_item.get("date"),
                    "embedding": emb.tolist() if isinstance(emb, (np.ndarray,)) else list(map(float, emb))
                }
                batch_rows.append(row)
            if dry_run:
                logger.info("Dry-run final: would upsert %d rows", len(batch_rows))
            else:
                upsert_batch_to_supabase(supabase, batch_rows)
                for rec_item in recs_for_batch:
                    mark_chunk_embedded(MANIFEST_DB, rec_item.get("text_hash"))
            total_upserted += len(batch_rows)
            # small pause
            time.sleep(0.1)

    logger.info("Embedding/upsert complete. Total upserted: %d", total_upserted)

# ---------------- CLI ----------------
def parse_args():
    p = argparse.ArgumentParser(description="Embed per-folder JSON and upsert to Supabase")
    p.add_argument("--model", type=str, default=EMB_MODEL, help="SentenceTransformer model name")
    p.add_argument("--batch", type=int, default=EMBED_BATCH_SIZE, help="Embedding batch size (chunks)")
    p.add_argument("--dry-run", action="store_true", help="Compute embeddings but do not upsert to Supabase")
    return p.parse_args()

def main():
    args = parse_args()
    run_embed_and_upsert(args.model, batch_size=args.batch, dry_run=args.dry_run)

if __name__ == "__main__":
    main()
