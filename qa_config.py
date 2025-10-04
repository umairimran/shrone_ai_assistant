# qa_config.py
from pathlib import Path

# Retrieval backend: "faiss" or "supabase"
RETRIEVAL_BACKEND = "supabase"  # changed from faiss to supabase

# Where your Phase-3 local indexes live:
INDEXES_LOCAL_ROOT = Path("indexes_local")

# Canonical categories (must match your ingestion)
CATEGORIES = [
    "Board & Committee Proceedings",
    "Bylaws & Governance Policies",
    "External Advocacy &  Communications",  # Note: two spaces before Communications
    "Policy & Position Statements",
    "Resolutions",
]

# Supabase only (if you switch to that backend)
SUPABASE_TABLE_BY_CATEGORY = {
    "Board & Committee Proceedings": "vs_board_committees",
    "Bylaws & Governance Policies": "vs_bylaws",
    "External Advocacy &  Communications": "vs_external_advocacy",  # Note: two spaces before Communications
    "Policy & Position Statements": "vs_policy_positions",
    "Resolutions": "vs_resolutions",
}

# Retrieval settings
TOP_K = 10
FETCH_K = 30        # for MMR diversity
MMR_LAMBDA = 0.25

# LLM
ANSWER_MODEL = "gpt-4o-mini"  # fast/accurate; set temperature=0 for determinism