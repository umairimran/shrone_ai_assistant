from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import os
from pathlib import Path

from qa_config import (
    RETRIEVAL_BACKEND, INDEXES_LOCAL_ROOT, CATEGORIES,
    SUPABASE_TABLE_BY_CATEGORY, TOP_K, FETCH_K, MMR_LAMBDA, ANSWER_MODEL
)

# LangChain
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.documents import Document

app = FastAPI(title="ACEP Document QA", version="1.0.0")

# --- Models ---
class AskRequest(BaseModel):
    question: str = Field(..., min_length=3)
    category: str = Field(..., description="Must be one of the 5 canonical categories")
    top_k: Optional[int] = Field(None, ge=1, le=20, description="Max passages to retrieve")

class AskResponse(BaseModel):
    answer: str
    citations: List[dict]  # [{title, category, pages, heading_path, chunk_index}]

# --- Validate env ---
if not os.environ.get("OPENAI_API_KEY"):
    raise RuntimeError("OPENAI_API_KEY missing")

# Use text-embedding-3-small to match our built indexes
EMB = OpenAIEmbeddings(model="text-embedding-3-small")
LLM = ChatOpenAI(model=ANSWER_MODEL, temperature=0)

# --- Helpers ---
def validate_category(cat: str) -> str:
    # normalize small variations (optional)
    normalized = cat.replace("By-Laws", "Bylaws").strip()
    if normalized not in CATEGORIES:
        raise HTTPException(400, f"Invalid category. Must be one of: {CATEGORIES}")
    return normalized

def load_faiss_retriever(category: str):
    folder = INDEXES_LOCAL_ROOT / category
    if not folder.exists():
        raise HTTPException(404, f"FAISS index not found for category '{category}' at {folder}")
    vs = FAISS.load_local(str(folder), embeddings=EMB, allow_dangerous_deserialization=True)
    retriever = vs.as_retriever(
        search_type="mmr",
        search_kwargs={"k": TOP_K, "fetch_k": FETCH_K, "lambda_mult": MMR_LAMBDA}
    )
    return retriever

def load_supabase_retriever(category: str):
    # Optional: swap to Supabase if you prefer remote retrieval
    from supabase import create_client
    from langchain_community.vectorstores import SupabaseVectorStore

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise HTTPException(500, "Supabase env vars missing")
    client = create_client(url, key)
    table = SUPABASE_TABLE_BY_CATEGORY[category]
    vs = SupabaseVectorStore(client, EMB, table_name=table, query_name=f"{table}_match")
    # Supabase retriever doesn't natively expose MMR; we can emulate by over-fetch + manual prune if needed.
    return vs.as_retriever(search_kwargs={"k": TOP_K})

def get_retriever(category: str):
    if RETRIEVAL_BACKEND == "faiss":
        return load_faiss_retriever(category)
    elif RETRIEVAL_BACKEND == "supabase":
        return load_supabase_retriever(category)
    else:
        raise HTTPException(500, "Unsupported RETRIEVAL_BACKEND")

def format_context(docs: List[Document]) -> str:
    pieces = []
    for d in docs:
        m = d.metadata or {}
        cite = f'{m.get("title","")} — {m.get("category","")} — p.{m.get("page_start")}-{m.get("page_end")} — {m.get("heading_path","")}'
        pieces.append(f"[{cite}]\n{d.page_content}")
    return "\n\n---\n\n".join(pieces)

SYSTEM = """You are an accuracy-first assistant. 
Answer ONLY using the provided context. If the answer is not present, say: 
"I don't have that information in the provided documents."

Rules:
- Do not use outside knowledge.
- Keep answers concise and quote key language when relevant.
- Always add short inline citations like (Title; Category; p.X–Y).
"""

HUMAN = """Category: {category}
User question: {question}

Context:
{context}

Write the best possible answer strictly from the context. If not found, say you don't have it.
Then list 2-5 concise citations used (title; category; pages; heading)."""

PROMPT = ChatPromptTemplate.from_messages([
    ("system", SYSTEM),
    ("human", HUMAN)
])

# --- Routes ---
@app.post("/v1/ask", response_model=AskResponse)
def ask(req: AskRequest):
    category = validate_category(req.category)
    retriever = get_retriever(category)
    k = req.top_k or TOP_K
    # pull a few more for better diversity when using FAISS/MMR
    docs = retriever.get_relevant_documents(req.question)[:k]
    if not docs:
        return AskResponse(answer="I don't have that information in the provided documents.", citations=[])

    ctx = format_context(docs)
    chain = PROMPT | LLM
    ans = chain.invoke({"category": category, "question": req.question, "context": ctx}).content

    # Build citations from top docs
    cites = []
    for d in docs[:5]:
        m = d.metadata or {}
        cites.append({
            "title": m.get("title", ""),
            "category": m.get("category", ""),
            "pages": f'{m.get("page_start")}–{m.get("page_end")}',
            "heading_path": m.get("heading_path", ""),
            "chunk_index": m.get("chunk_index", None)
        })

    return AskResponse(answer=ans, citations=cites)

@app.get("/health")
def health():
    return {"status": "ok", "backend": RETRIEVAL_BACKEND, "categories": CATEGORIES}

@app.get("/")
def root():
    return {
        "message": "ACEP Document QA Service", 
        "version": "1.0.0",
        "endpoints": {
            "ask": "POST /v1/ask",
            "health": "GET /health"
        },
        "categories": CATEGORIES
    }