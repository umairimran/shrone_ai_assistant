-- supabase_functions.sql
-- Run this in your Supabase SQL Editor to create the required functions

-- Function 1: Vector search with folder filter
CREATE OR REPLACE FUNCTION match_documents_by_folder(
  query_embedding vector(384),
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
  embedding vector(384),
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
  query_embedding vector(384),
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
  embedding vector(384),
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
  query_embedding vector(384),
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
  embedding vector(384),
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
