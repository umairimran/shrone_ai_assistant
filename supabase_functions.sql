-- supabase_functions.sql
-- Phase 2: Per-Category pgvector Tables for ACEP Document Processing
-- Run this in your Supabase SQL Editor

-- ==========================================
-- PHASE 2: CREATE PER-CATEGORY TABLES
-- ==========================================

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Table 1: Board and Committee Proceedings
CREATE TABLE IF NOT EXISTS vs_board_committees (
  id text PRIMARY KEY,            -- chunk_id = sha256(text)
  content text NOT NULL,
  metadata jsonb NOT NULL,
  embedding vector(1536)          -- OpenAI text-embedding-3-small (1536 dimensions, faster & cheaper)
);

-- Table 2: Bylaws & Governance Policies  
CREATE TABLE IF NOT EXISTS vs_bylaws (
  id text PRIMARY KEY,            -- chunk_id = sha256(text)
  content text NOT NULL,
  metadata jsonb NOT NULL,
  embedding vector(1536)          -- OpenAI text-embedding-3-small (1536 dimensions, faster & cheaper)
);

-- Table 3: External Advocacy & Communications
CREATE TABLE IF NOT EXISTS vs_external_advocacy (
  id text PRIMARY KEY,            -- chunk_id = sha256(text)
  content text NOT NULL,
  metadata jsonb NOT NULL,
  embedding vector(1536)          -- OpenAI text-embedding-3-small (1536 dimensions, faster & cheaper)
);

-- Table 4: Policy & Position Statements
CREATE TABLE IF NOT EXISTS vs_policy_positions (
  id text PRIMARY KEY,            -- chunk_id = sha256(text)
  content text NOT NULL,
  metadata jsonb NOT NULL,
  embedding vector(1536)          -- OpenAI text-embedding-3-small (1536 dimensions, faster & cheaper)
);

-- Table 5: Resolutions
CREATE TABLE IF NOT EXISTS vs_resolutions (
  id text PRIMARY KEY,            -- chunk_id = sha256(text)
  content text NOT NULL,
  metadata jsonb NOT NULL,
  embedding vector(1536)          -- OpenAI text-embedding-3-small (1536 dimensions, faster & cheaper)
);

-- ==========================================
-- PHASE 2: CREATE INDEXES FOR PERFORMANCE
-- ==========================================

-- Create HNSW indexes for efficient vector similarity search
-- Note: Only create indexes after inserting data for better performance

-- Board and Committee Proceedings
CREATE INDEX IF NOT EXISTS vs_board_committees_embedding_idx 
ON vs_board_committees USING hnsw (embedding vector_cosine_ops);

-- Bylaws & Governance Policies
CREATE INDEX IF NOT EXISTS vs_bylaws_embedding_idx 
ON vs_bylaws USING hnsw (embedding vector_cosine_ops);

-- External Advocacy & Communications  
CREATE INDEX IF NOT EXISTS vs_external_advocacy_embedding_idx 
ON vs_external_advocacy USING hnsw (embedding vector_cosine_ops);

-- Policy & Position Statements
CREATE INDEX IF NOT EXISTS vs_policy_positions_embedding_idx 
ON vs_policy_positions USING hnsw (embedding vector_cosine_ops);

-- Resolutions
CREATE INDEX IF NOT EXISTS vs_resolutions_embedding_idx 
ON vs_resolutions USING hnsw (embedding vector_cosine_ops);

-- ==========================================
-- PHASE 2: CATEGORY-SPECIFIC SEARCH FUNCTIONS
-- ==========================================

-- Search function for Board and Committee Proceedings
CREATE OR REPLACE FUNCTION search_board_committees(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vs.id,
    vs.content,
    vs.metadata,
    1 - (vs.embedding <=> query_embedding) as similarity
  FROM vs_board_committees vs
  WHERE 1 - (vs.embedding <=> query_embedding) > match_threshold
  ORDER BY vs.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Search function for Bylaws & Governance Policies
CREATE OR REPLACE FUNCTION search_bylaws(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vs.id,
    vs.content,
    vs.metadata,
    1 - (vs.embedding <=> query_embedding) as similarity
  FROM vs_bylaws vs
  WHERE 1 - (vs.embedding <=> query_embedding) > match_threshold
  ORDER BY vs.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Search function for External Advocacy & Communications
CREATE OR REPLACE FUNCTION search_external_advocacy(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vs.id,
    vs.content,
    vs.metadata,
    1 - (vs.embedding <=> query_embedding) as similarity
  FROM vs_external_advocacy vs
  WHERE 1 - (vs.embedding <=> query_embedding) > match_threshold
  ORDER BY vs.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Search function for Policy & Position Statements
CREATE OR REPLACE FUNCTION search_policy_positions(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vs.id,
    vs.content,
    vs.metadata,
    1 - (vs.embedding <=> query_embedding) as similarity
  FROM vs_policy_positions vs
  WHERE 1 - (vs.embedding <=> query_embedding) > match_threshold
  ORDER BY vs.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Search function for Resolutions
CREATE OR REPLACE FUNCTION search_resolutions(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vs.id,
    vs.content,
    vs.metadata,
    1 - (vs.embedding <=> query_embedding) as similarity
  FROM vs_resolutions vs
  WHERE 1 - (vs.embedding <=> query_embedding) > match_threshold
  ORDER BY vs.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ==========================================
-- LEGACY FUNCTIONS (Phase 1 - for reference)
-- ==========================================

-- Function 1: Vector search with folder filter
CREATE OR REPLACE FUNCTION match_documents_by_folder(
  query_embedding vector(1536),
  folder_name text,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  chunk_id text,
  doc_id text,
  doc_title text,
  folder text,
  text text,
  page_start int,
  page_end int,
  char_start int,
  char_end int,
  n_tokens int,
  embedding vector(1536),
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.chunk_id,
    d.doc_id,
    d.doc_title,
    d.folder,
    d.text,
    d.page_start,
    d.page_end,
    d.char_start,
    d.char_end,
    d.n_tokens,
    d.embedding,
    (d.embedding <#> query_embedding) * -1 as similarity
  FROM documents d
  WHERE d.folder = folder_name
    AND (d.embedding <#> query_embedding) * -1 > match_threshold
  ORDER BY d.embedding <#> query_embedding
  LIMIT match_count;
END;
$$;

-- Function 2: General vector search (for fallback)
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  chunk_id text,
  doc_id text,
  doc_title text,
  folder text,
  text text,
  page_start int,
  page_end int,
  char_start int,
  char_end int,
  n_tokens int,
  embedding vector(1536),
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.chunk_id,
    d.doc_id,
    d.doc_title,
    d.folder,
    d.text,
    d.page_start,
    d.page_end,
    d.char_start,
    d.char_end,
    d.n_tokens,
    d.embedding,
    (d.embedding <#> query_embedding) * -1 as similarity
  FROM documents d
  WHERE (d.embedding <#> query_embedding) * -1 > match_threshold
  ORDER BY d.embedding <#> query_embedding
  LIMIT match_count;
END;
$$;

-- Function 3: Hybrid search with text matching
CREATE OR REPLACE FUNCTION hybrid_search_documents(
  query_embedding vector(1536),
  query_text text,
  folder_names text[] DEFAULT NULL,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  chunk_id text,
  doc_id text,
  doc_title text,
  folder text,
  text text,
  page_start int,
  page_end int,
  char_start int,
  char_end int,
  n_tokens int,
  embedding vector(1536),
  vector_similarity float,
  text_rank float,
  hybrid_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.chunk_id,
    d.doc_id,
    d.doc_title,
    d.folder,
    d.text,
    d.page_start,
    d.page_end,
    d.char_start,
    d.char_end,
    d.n_tokens,
    d.embedding,
    (d.embedding <#> query_embedding) * -1 as vector_similarity,
    ts_rank(to_tsvector('english', d.text), plainto_tsquery('english', query_text)) as text_rank,
    -- Weighted combination: 70% vector, 30% text
    ((d.embedding <#> query_embedding) * -1 * 0.7) + 
    (ts_rank(to_tsvector('english', d.text), plainto_tsquery('english', query_text)) * 0.3) as hybrid_score
  FROM documents d
  WHERE 
    (folder_names IS NULL OR d.folder = ANY(folder_names))
    AND (
      (d.embedding <#> query_embedding) * -1 > 0.1 
      OR to_tsvector('english', d.text) @@ plainto_tsquery('english', query_text)
    )
  ORDER BY hybrid_score DESC
  LIMIT match_count;
END;
$$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder);
CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_documents_text_search ON documents USING gin(to_tsvector('english', text));

-- Grant permissions
GRANT EXECUTE ON FUNCTION match_documents_by_folder TO anon, authenticated;
GRANT EXECUTE ON FUNCTION match_documents TO anon, authenticated;
GRANT EXECUTE ON FUNCTION hybrid_search_documents TO anon, authenticated;
