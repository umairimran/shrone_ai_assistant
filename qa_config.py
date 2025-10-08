# qa_config.py
from pathlib import Path

# Retrieval backend: only "supabase" is supported
RETRIEVAL_BACKEND = "supabase"

# Canonical categories (must match your ingestion)
CATEGORIES = [
    "Board and Committee Proceedings",
    "Bylaws & Governance Policies",
    "External Advocacy &  Communications",  # Note: two spaces before Communications
    "Policy & Position Statements",
    "Resolutions",
]

# Supabase table mapping by category
SUPABASE_TABLE_BY_CATEGORY = {
    "Board and Committee Proceedings": "vs_board_committees",
    "Bylaws & Governance Policies": "vs_bylaws",
    "External Advocacy &  Communications": "vs_external_advocacy",  # Note: two spaces before Communications
    "Policy & Position Statements": "vs_policy_positions",
    "Resolutions": "vs_resolutions",
}

# Retrieval settings
TOP_K = 15
FETCH_K = 40      # for MMR diversity
MMR_LAMBDA = 0.2

# LLM
ANSWER_MODEL = "gpt-4o-mini"  # fast/accurate; set temperature=0 for determinism