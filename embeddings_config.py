"""
Embeddings Configuration for ACEP Document Processing Phase 3

This module contains all configuration mappings for category normalization,
Supabase table routing, and embedding parameters as specified in Phase 3.
"""

# Category mapping from folder names to canonical category names
CATEGORY_MAP = {
    "Board_and_Committee_Proceedings": "Board and Committee Proceedings",
    "By-Laws_Governance_Policies": "By-Laws & Governance Policies", 
    "External_Advocacy_Communications": "External Advocacy &  Communications",
    "Policy_Position_Statements": "Policy & Position Statements",
    "Resolutions": "Resolutions",
}

# Supabase table mapping by category
SUPABASE_TABLE_BY_CATEGORY = {
    "Board and Committee Proceedings": "vs_board_committees",
    "By-Laws & Governance Policies": "vs_bylaws",
    "External Advocacy &  Communications": "vs_external_advocacy", 
    "Policy & Position Statements": "vs_policy_positions",
    "Resolutions": "vs_resolutions",
}

# OpenAI embedding configuration
OPENAI_EMBED_MODEL = "text-embedding-3-small"  # Changed from 3-large due to Supabase limits
BATCH_SIZE = 50  # Reduced from 128 to avoid token limits and duplicate issues