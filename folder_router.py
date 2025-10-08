#!/usr/bin/env python3
"""
folder_router.py

Phase 3: GPT-Based Folder Routing System
- Creates human-readable folder summaries (1-3 lines each)
- Routes queries to appropriate folders using GPT
- Simple, fast, and accurate routing for small folder sets
"""

import os
import json
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass
from dotenv import load_dotenv

# OpenAI for GPT-based routing
import openai

# Supabase (optional)
from supabase import create_client, Client

load_dotenv()

@dataclass
class FolderInfo:
    name: str
    path: str
    summary: str
    doc_count: int = 0

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# GPT System Prompt for Folder Routing
SYSTEM_PROMPT = """You are a folder routing assistant. 
Your ONLY job is to decide which folder (or at most two folders) is most relevant for a given user query. 

Rules:
1. Read the user's query.
2. Read the list of folder names and their summaries.
3. Choose the ONE best folder that contains the most relevant information.
4. If the query clearly spans multiple folders, choose at most TWO.
5. Output ONLY the folder name(s) in a JSON array format: ["folder_name"] or ["folder1", "folder2"]
6. If not sure, pick the closest match by description.
7. Use the EXACT folder names provided in the list (with underscores).

Example output formats:
- Single folder: ["Board_and_Committee_Proceedings"]
- Two folders: ["Board_and_Committee_Proceedings", "Resolutions"]

IMPORTANT: Use underscores (_) in folder names, not spaces or ampersands.
"""

class FolderRouter:
    def __init__(self):
        self.folders: List[FolderInfo] = []
        self.supabase = self._init_supabase() if SUPABASE_URL and SUPABASE_KEY else None
        self.openai_client = openai.OpenAI() if os.environ.get("OPENAI_API_KEY") else None
        
        # Initialize with predefined ACEP categories (no database needed)
        self._init_categories()
        
    def _init_categories(self):
        """Initialize with predefined ACEP categories without database."""
        folder_summaries = {
            "Board_and_Committee_Proceedings": (
                "Board meeting minutes, committee proceedings, governance decisions, executive session documents, "
                "and organizational voting records. Contains confidential and non-confidential meeting materials."
            ),
            "Bylaws_and_Governance_Policies": (
                "ACEP organizational bylaws, governance structure, leadership policies, rules and regulations. "
                "Official organizational guidelines and compliance procedures."
            ),
            "External_Advocacy_and_Communications": (
                "External advocacy efforts, public communications, media statements, press releases, "
                "and outreach campaigns. Public-facing position announcements and advocacy materials."
            ),
            "Policy_and_Position_Statements": (
                "Official ACEP clinical and organizational policy positions, position statements, "
                "clinical recommendations, practice guidelines, and emergency medicine standards."
            ),
            "Resolutions": (
                "Organizational resolutions, adopted motions, formal council decisions, voting records, "
                "and official determinations on emergency medicine and organizational matters."
            )
        }
        
        # Create folder info objects from predefined categories
        for folder_name, summary in folder_summaries.items():
            folder_info = FolderInfo(
                name=folder_name,
                path=f"./documents/{folder_name.replace('_', ' ')}",
                summary=summary,
                doc_count=0  # Not needed for routing
            )
            self.folders.append(folder_info)
        
        print(f"✅ Initialized {len(self.folders)} ACEP categories for routing")
        
    def _init_supabase(self) -> Optional[Client]:
        try:
            return create_client(SUPABASE_URL, SUPABASE_KEY)
        except Exception as e:
            print(f"Warning: Could not initialize Supabase: {e}")
            return None
    
    def create_folder_summaries(self, documents_dir: Path = Path("./documents")):
        """Create human-readable summaries for each folder (1-3 lines each)"""
        
        # Define exact 1-3 line folder summaries based on actual document contents
        # IMPORTANT: These folder names MUST match the database folder column values
        # Database stores with underscores: Board_and_Committee_Proceedings
        folder_summaries = {
            "Board_and_Committee_Proceedings": (
                "Board meeting minutes, committee proceedings, governance decisions, executive session documents, "
                "and organizational voting records. Contains confidential and non-confidential meeting materials."
            ),
            "Bylaws_and_Governance_Policies": (
                "ACEP organizational bylaws, governance structure, leadership policies, rules and regulations. "
                "Official organizational guidelines and compliance procedures."
            ),
            "External_Advocacy_and_Communications": (
                "External advocacy efforts, public communications, media statements, press releases, "
                "and outreach campaigns. Public-facing position announcements and advocacy materials."
            ),
            "Policy_and_Position_Statements": (
                "Official ACEP clinical and organizational policy positions, position statements, "
                "clinical recommendations, practice guidelines, and emergency medicine standards."
            ),
            "Resolutions": (
                "Organizational resolutions, adopted motions, formal council decisions, voting records, "
                "and official determinations on emergency medicine and organizational matters."
            )
        }
        
        self.folders = []
        
        for folder_name in documents_dir.iterdir():
            if folder_name.is_dir():
                # Skip hidden folders
                if folder_name.name.startswith('__') or folder_name.name.startswith('.'):
                    continue
                    
                # Count documents in folder
                doc_count = len([f for f in folder_name.rglob("*.pdf") if f.is_file()])
                
                # Get summary (use predefined or create generic)
                summary = folder_summaries.get(
                    folder_name.name, 
                    f"Documents and files related to {folder_name.name.lower().replace('-', ' ')}."
                )
                
                # Use absolute path and convert to string with forward slashes
                folder_path = str(folder_name.resolve()).replace('\\', '/')
                
                folder_info = FolderInfo(
                    name=folder_name.name,
                    path=folder_path,
                    summary=summary,
                    doc_count=doc_count
                )
                self.folders.append(folder_info)
                
        print(f"✅ Created summaries for {len(self.folders)} folders")
        return self.folders
    
    def route_query(self, query: str) -> Dict:
        """
        Phase 3: GPT-Based Folder Routing
        
        Steps:
        1. Load folder summaries
        2. Construct user prompt with query + folder list
        3. Send to GPT with system prompt
        4. Parse GPT response (folder names)
        5. Return routing decision
        
        Returns:
            Dict with:
            - query: original query
            - selected_folders: list of folder names
            - method: "gpt"
            - reasoning: GPT's explanation (optional)
        """
        if not self.folders:
            return {
                "error": "No folders initialized",
                "query": query,
                "selected_folders": []
            }
        
        if not self.openai_client:
            return {
                "error": "OpenAI API key not configured",
                "query": query,
                "selected_folders": []
            }
        
        # Step 1: Build folder list for GPT
        folder_list = []
        for i, folder in enumerate(self.folders, 1):
            folder_list.append(f"{i}. {folder.name}: {folder.summary}")
        
        folders_text = "\n".join(folder_list)
        
        # Step 2: Construct user prompt
        user_prompt = f"""User query: "{query}"

Available folders:
{folders_text}

Now pick the best folder(s). Return ONLY a JSON array with folder name(s).
Example: ["Board and Committee Proceedings"] or ["Board and Committee Proceedings", "Resolutions"]"""
        
        # Step 3: Call GPT
        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=100,
                temperature=0.0  # Deterministic routing
            )
            
            # Step 4: Parse response
            result_text = response.choices[0].message.content.strip()
            
            # Try to extract JSON array
            try:
                # Handle if GPT wraps in ```json or other formatting
                if "```" in result_text:
                    result_text = result_text.split("```")[1]
                    if result_text.startswith("json"):
                        result_text = result_text[4:]
                result_text = result_text.strip()
                
                selected_folders = json.loads(result_text)
                
                # Ensure it's a list
                if not isinstance(selected_folders, list):
                    selected_folders = [selected_folders]
                
            except json.JSONDecodeError:
                # Fallback: extract folder names from text
                selected_folders = []
                for folder in self.folders:
                    if folder.name in result_text:
                        selected_folders.append(folder.name)
                
                if not selected_folders:
                    # Use first folder as fallback
                    selected_folders = [self.folders[0].name]
            
            # Step 5: Return result
            return {
                "query": query,
                "method": "gpt",
                "selected_folders": selected_folders,
                "confidence": "high" if len(selected_folders) == 1 else "medium",
                "routing_decision": "single_folder" if len(selected_folders) == 1 else "multi_folder",
                "raw_response": result_text
            }
            
        except Exception as e:
            # Fallback: use first folder if GPT fails
            return {
                "error": f"GPT routing failed: {e}",
                "query": query,
                "method": "fallback",
                "selected_folders": [self.folders[0].name] if self.folders else [],
                "confidence": "low"
            }
    
    def display_folder_info(self):
        """Display folder summaries and statistics"""
        print("\n" + "="*70)
        print("📁 PHASE 3: GPT-BASED FOLDER ROUTING SYSTEM")
        print("="*70)
        
        for i, folder in enumerate(self.folders, 1):
            print(f"\n{i}. {folder.name}")
            print(f"   📂 Path: {folder.path}")
            print(f"   📄 Documents: {folder.doc_count}")
            print(f"   📝 Summary: {folder.summary}")
        
        print("\n" + "="*70)
        print(f"Total folders: {len(self.folders)}")
        print("="*70)

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="ACEP Document Folder Router (GPT-Based)")
    parser.add_argument("--setup", action="store_true", help="Setup folders (create summaries)")
    parser.add_argument("--query", type=str, help="Route a query to folders using GPT")
    parser.add_argument("--info", action="store_true", help="Display folder information")
    parser.add_argument("--test", action="store_true", help="Run test queries")
    
    args = parser.parse_args()
    
    router = FolderRouter()
    
    if args.setup:
        print("\n🚀 PHASE 3: Setting up GPT-Based Folder Routing System...")
        print("=" * 70)
        try:
            print("\n📝 Step 1: Creating folder summaries (1-3 lines each)...")
            router.create_folder_summaries()
            
            print("\n💾 Step 2: Saving to local SQLite database...")
            router.save_to_database()
            
            print("\n📊 Step 3: Displaying folder information...")
            router.display_folder_info()
            
            print("\n✅ PHASE 3 SETUP COMPLETED SUCCESSFULLY!")
            print("\n🤖 Routing Method: GPT-4o-mini")
            print("   • Fast and accurate for small folder sets")
            print("   • No embeddings or similarity thresholds needed")
            print("   • Controlled via system prompt")
            print("   • Picks 1-2 most relevant folders per query")
            
        except Exception as e:
            print(f"❌ Setup failed: {e}")
            import traceback
            traceback.print_exc()
        
    elif args.query:
        print(f"\n🔍 Routing query: '{args.query}'")
        print("=" * 70)
        result = router.route_query(args.query)
        
        if "error" in result:
            print(f"❌ Error: {result['error']}")
        else:
            print(f"\n✅ Selected folder(s): {', '.join(result['selected_folders'])}")
            print(f"📊 Method: {result['method']}")
            print(f"🎯 Confidence: {result['confidence']}")
            if 'raw_response' in result:
                print(f"🤖 GPT Response: {result['raw_response']}")
        
    elif args.info:
        router.load_from_database()
        router.display_folder_info()
        
    elif args.test:
        test_queries = [
            # Single folder queries
            "What did the board decide about the John G. Wiegenstein Award in May 2025?",
            "Show me the ACEP bylaws and organizational structure",
            "What is ACEP's position on corporate practice of medicine?",
            "Find the council resolutions from 2024",
            "What statements has ACEP released about CDC leadership?",
            
            # Multi-folder queries
            "Show me all governance and policy documents",
            "What decisions were made about emergency medicine practice?",
            
            # Ambiguous queries
            "Tell me about patient safety protocols",
            "What are the leadership roles and responsibilities?"
        ]
        
        print("\n" + "="*70)
        print("🧪 PHASE 3 GPT-BASED ROUTING TESTS")
        print("="*70)
        
        for i, query in enumerate(test_queries, 1):
            print(f"\n{i}. Query: {query}")
            result = router.route_query(query)
            
            if "error" in result:
                print(f"   ❌ Error: {result['error']}")
            else:
                print(f"   ✅ Folders: {', '.join(result['selected_folders'])}")
                print(f"   📊 Method: {result['method']}")
                print(f"   🎯 Confidence: {result['confidence']}")
    
    else:
        parser.print_help()

def map_folder_to_category(folder_name):
    """Map folder names to display category names."""
    folder_to_category = {
        "Board_and_Committee_Proceedings": "Board and Committee Proceedings",
        "Bylaws_and_Governance_Policies": "By-Laws & Governance Policies",
        "External_Advocacy_and_Communications": "External Advocacy &  Communications",
        "Policy_and_Position_Statements": "Policy & Position Statements",
        "Resolutions": "Resolutions"
    }
    return folder_to_category.get(folder_name, folder_name)

def map_category_to_folder(category_name):
    """Map display category names to folder names."""
    category_to_folder = {
        "Board and Committee Proceedings": "Board_and_Committee_Proceedings",
        "By-Laws & Governance Policies": "Bylaws_and_Governance_Policies",
        "External Advocacy &  Communications": "External_Advocacy_and_Communications",
        "Policy & Position Statements": "Policy_and_Position_Statements",
        "Resolutions": "Resolutions"
    }
    return category_to_folder.get(category_name, category_name)

if __name__ == "__main__":
    main()
