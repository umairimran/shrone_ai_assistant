#!/usr/bin/env python3
"""
folder_router.py

Phase 3: Folder Routing System
- Creates folder summaries and embeddings
- Routes queries to appropriate folders using similarity matching
- Supports both embedding-based and LLM fallback routing
"""

import os
import json
import sqlite3
import numpy as np
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from dotenv import load_dotenv

# ML imports
from sentence_transformers import SentenceTransformer
import openai

# Supabase
from supabase import create_client, Client

load_dotenv()

@dataclass
class FolderInfo:
    name: str
    path: str
    summary: str
    embedding: Optional[List[float]] = None
    doc_count: int = 0

# Configuration
FOLDERS_DB = Path("./folders.db")
EMB_MODEL = "all-MiniLM-L6-v2"
SIMILARITY_THRESHOLD = 0.7  # Single folder if similarity > this
MULTI_FOLDER_THRESHOLD = 0.5  # Include in multi-folder if similarity > this
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

class FolderRouter:
    def __init__(self):
        self.model = SentenceTransformer(EMB_MODEL)
        self.folders: List[FolderInfo] = []
        self.supabase = self._init_supabase() if SUPABASE_URL and SUPABASE_KEY else None
        
    def _init_supabase(self) -> Optional[Client]:
        try:
            return create_client(SUPABASE_URL, SUPABASE_KEY)
        except Exception as e:
            print(f"Warning: Could not initialize Supabase: {e}")
            return None
    
    def create_folder_summaries(self, documents_dir: Path = Path("./documents")):
        """Create human summaries for each folder based on document analysis"""
        
        # Define exact 1-3 line folder summaries based on actual document contents
        folder_summaries = {
            "Board and Committee Proceedings": (
                "Board of Directors meeting minutes, executive committee meetings, and virtual sessions from 2022-2025. "
                "Contains both confidential and non-confidential board decisions, meeting materials, and governance proceedings."
            ),
            "By-Laws & Governance Policies": (
                "ACEP organizational bylaws and governance structure documents. "
                "Contains the official organizational rulebook and structural policies updated as of October 2024."
            ),
            "External Advocacy &  Communications": (
                "Public statements, press releases, and advocacy positions on healthcare policy. "
                "Includes ACEP responses to federal regulations, CDC leadership, vaccine schedules, and healthcare legislation."
            ),
            "Policy & Position Statements": (
                "Official ACEP clinical and organizational policy documents including policy compendium. "
                "Contains position statements on emergency medicine practice, corporate medicine, consultation requirements, and trauma care."
            ),
            "Resolutions": (
                "Council and Board resolutions from 2024-2025 including voting records. "
                "Contains formal organizational decisions on boarding, safety events, and financial oversight."
            )
        }
        
        self.folders = []
        
        for folder_name in documents_dir.iterdir():
            if folder_name.is_dir():
                # Skip __MACOSX and hidden folders
                if folder_name.name.startswith('__MACOSX') or folder_name.name.startswith('.'):
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
                
        print(f"Created summaries for {len(self.folders)} folders")
        return self.folders
    
    def create_folder_embeddings(self):
        """Generate embeddings for folder summaries"""
        if not self.folders:
            raise ValueError("No folders found. Run create_folder_summaries() first.")
        
        summaries = [folder.summary for folder in self.folders]
        embeddings = self.model.encode(summaries, convert_to_numpy=True)
        
        for folder, embedding in zip(self.folders, embeddings):
            folder.embedding = embedding.tolist()
            
        print(f"Generated embeddings for {len(self.folders)} folders")
        return self.folders
    
    def save_to_database(self):
        """Save folder information to SQLite database"""
        conn = sqlite3.connect(FOLDERS_DB)
        c = conn.cursor()
        
        # Create folders table
        c.execute('''
            CREATE TABLE IF NOT EXISTS folders (
                name TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                summary TEXT NOT NULL,
                embedding TEXT NOT NULL,
                doc_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Insert folders
        for folder in self.folders:
            c.execute('''
                INSERT OR REPLACE INTO folders 
                (name, path, summary, embedding, doc_count)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                folder.name,
                folder.path,
                folder.summary,
                json.dumps(folder.embedding),
                folder.doc_count
            ))
        
        conn.commit()
        conn.close()
        print(f"Saved {len(self.folders)} folders to database")
    
    def load_from_database(self):
        """Load folder information from database"""
        if not FOLDERS_DB.exists():
            raise FileNotFoundError(f"Folders database not found at {FOLDERS_DB}")
        
        conn = sqlite3.connect(FOLDERS_DB)
        c = conn.cursor()
        
        c.execute('SELECT name, path, summary, embedding, doc_count FROM folders')
        rows = c.fetchall()
        
        self.folders = []
        for name, path, summary, embedding_json, doc_count in rows:
            folder = FolderInfo(
                name=name,
                path=path,
                summary=summary,
                embedding=json.loads(embedding_json),
                doc_count=doc_count
            )
            self.folders.append(folder)
        
        conn.close()
        print(f"Loaded {len(self.folders)} folders from database")
        return self.folders
    
    def create_supabase_folders_table(self):
        """Create folders table in Supabase to store folder summaries and embeddings"""
        if not self.supabase:
            print("Warning: Supabase not initialized. Folders will only be stored locally.")
            return
        
        # Note: This would typically be done via Supabase SQL editor or migration
        # For now, we'll just ensure the table structure is documented
        table_schema = """
        CREATE TABLE IF NOT EXISTS folders (
            id SERIAL PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            path TEXT NOT NULL,
            summary TEXT NOT NULL,
            embedding VECTOR(384),  -- pgvector extension required
            doc_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """
        print("Supabase folders table schema:")
        print(table_schema)
        
        # Try to upsert folder data to Supabase
        try:
            for folder in self.folders:
                folder_data = {
                    "name": folder.name,
                    "path": folder.path,
                    "summary": folder.summary,
                    "embedding": folder.embedding,
                    "doc_count": folder.doc_count
                }
                
                # Upsert to Supabase folders table
                response = self.supabase.table("folders").upsert(folder_data).execute()
                print(f"✅ Upserted folder to Supabase: {folder.name}")
                
        except Exception as e:
            print(f"Warning: Could not upsert folders to Supabase: {e}")
            print("Folders are still available locally in SQLite database.")
    
    def route_query_embedding(self, query: str) -> Dict:
        """Route query using embedding similarity"""
        if not self.folders:
            self.load_from_database()
        
        # Embed the query
        query_embedding = self.model.encode([query], convert_to_numpy=True)[0]
        
        # Calculate similarities
        similarities = []
        for folder in self.folders:
            folder_emb = np.array(folder.embedding)
            similarity = np.dot(query_embedding, folder_emb) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(folder_emb)
            )
            similarities.append((folder, similarity))
        
        # Sort by similarity
        similarities.sort(key=lambda x: x[1], reverse=True)
        
        # Apply routing logic
        top_folder, top_similarity = similarities[0]
        
        result = {
            "query": query,
            "method": "embedding",
            "top_similarity": top_similarity,
            "all_similarities": [(f.name, sim) for f, sim in similarities]
        }
        
        if top_similarity >= SIMILARITY_THRESHOLD:
            # High confidence: single folder
            result["routing_decision"] = "single_folder"
            result["selected_folders"] = [top_folder.name]
            result["confidence"] = "high"
        elif len(similarities) > 1 and similarities[1][1] >= MULTI_FOLDER_THRESHOLD:
            # Ambiguous: multi-folder
            selected = [f.name for f, sim in similarities[:2] if sim >= MULTI_FOLDER_THRESHOLD]
            result["routing_decision"] = "multi_folder"
            result["selected_folders"] = selected
            result["confidence"] = "medium"
        else:
            # Low confidence: fallback to all or top folder
            result["routing_decision"] = "low_confidence"
            result["selected_folders"] = [top_folder.name]
            result["confidence"] = "low"
        
        return result
    
    def route_query_llm(self, query: str) -> Dict:
        """Route query using LLM (OpenAI) as fallback"""
        if not os.environ.get("OPENAI_API_KEY"):
            return {"error": "OpenAI API key not configured"}
        
        # Create folder descriptions
        folder_descriptions = []
        for folder in self.folders:
            folder_descriptions.append(f"- {folder.name}: {folder.summary}")
        
        folders_text = "\n".join(folder_descriptions)
        
        prompt = f"""Given this query: "{query}"

And these document folders:
{folders_text}

Which folder(s) should be searched? Respond with:
1. The folder name(s) most relevant to the query
2. Your confidence level (high/medium/low)
3. Brief reasoning

Format your response as JSON:
{{
    "selected_folders": ["folder_name"],
    "confidence": "high|medium|low", 
    "reasoning": "brief explanation"
}}"""

        try:
            client = openai.OpenAI()
            response = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                temperature=0.1
            )
            
            result_text = response.choices[0].message.content
            llm_result = json.loads(result_text)
            
            return {
                "query": query,
                "method": "llm",
                "routing_decision": "llm_decision", 
                "selected_folders": llm_result["selected_folders"],
                "confidence": llm_result["confidence"],
                "reasoning": llm_result["reasoning"]
            }
            
        except Exception as e:
            return {"error": f"LLM routing failed: {e}"}
    
    def route_query(self, query: str, use_llm_fallback: bool = True) -> Dict:
        """
        Phase 3 Main Routing Method with Exact Requirements:
        1. Embedding-based router (primary)
        2. LLM fallback for low confidence (optional)
        3. Exact routing policy implementation
        """
        # Use Phase 3 implementation
        result = self.implement_phase3_routing_policy(query)
        
        # LLM fallback for low confidence (optional, saves cost)
        if (use_llm_fallback and 
            result["confidence"] == "low" and 
            os.environ.get("OPENAI_API_KEY")):
            
            print(f"Low confidence ({result['top_similarity']:.3f}), trying LLM fallback...")
            llm_result = self.route_query_llm(query)
            
            if "error" not in llm_result:
                llm_result["fallback_from"] = "embedding"
                llm_result["embedding_result"] = result
                return llm_result
        
        return result
    
    def implement_phase3_routing_policy(self, query: str) -> Dict:
        """
        Exact Phase 3 implementation:
        1. Embedding-based router (primary)
        2. Cosine similarity with thresholds
        3. LLM fallback for low confidence
        4. Smart routing policy
        """
        if not self.folders:
            self.load_from_database()
        
        # Step 1: Embedding-based routing (primary router)
        query_embedding = self.model.encode([query], convert_to_numpy=True)[0]
        
        # Step 2: Compute cosine similarity to all folder embeddings
        similarities = []
        for folder in self.folders:
            folder_emb = np.array(folder.embedding)
            # Cosine similarity formula
            cosine_sim = np.dot(query_embedding, folder_emb) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(folder_emb)
            )
            similarities.append((folder, cosine_sim))
        
        # Sort by similarity (highest first)
        similarities.sort(key=lambda x: x[1], reverse=True)
        
        top_folder, top_similarity = similarities[0]
        second_folder, second_similarity = similarities[1] if len(similarities) > 1 else (None, 0.0)
        
        result = {
            "query": query,
            "method": "embedding_cosine",
            "top_similarity": float(top_similarity),
            "second_similarity": float(second_similarity) if second_folder else 0.0,
            "all_similarities": [(f.name, float(sim)) for f, sim in similarities]
        }
        
        # Step 3: Apply routing policy with exact thresholds
        if top_similarity >= SIMILARITY_THRESHOLD:  # 0.7
            # High confidence: single folder
            result["routing_decision"] = "single_folder"
            result["selected_folders"] = [top_folder.name]
            result["confidence"] = "high"
            result["reason"] = f"High similarity ({top_similarity:.3f}) to single folder"
            
        elif (second_folder and 
              top_similarity >= MULTI_FOLDER_THRESHOLD and  # 0.5
              second_similarity >= MULTI_FOLDER_THRESHOLD):
            # Ambiguous: multi-folder search
            result["routing_decision"] = "multi_folder"
            result["selected_folders"] = [top_folder.name, second_folder.name]
            result["confidence"] = "medium"
            result["reason"] = f"Ambiguous query, searching top 2 folders"
            
        else:
            # Low confidence: use LLM fallback or default to top folder
            result["routing_decision"] = "low_confidence"
            result["selected_folders"] = [top_folder.name]
            result["confidence"] = "low"
            result["reason"] = f"Low similarity ({top_similarity:.3f}), consider LLM fallback"
        
        # Step 4: Special handling for multi-folder queries
        if any(phrase in query.lower() for phrase in ["all", "show me all", "everything", "across"]):
            if len(similarities) >= 2:
                # Multi-folder query detected
                top_two = [f.name for f, _ in similarities[:2]]
                result["routing_decision"] = "multi_folder_query"
                result["selected_folders"] = top_two
                result["confidence"] = "medium"
                result["reason"] = "Multi-folder query detected ('all', 'everything', etc.)"
        
        return result
    
    def display_folder_info(self):
        """Display folder summaries and statistics"""
        print("\n" + "="*60)
        print("FOLDER ROUTING SYSTEM - FOLDER SUMMARIES")
        print("="*60)
        
        for i, folder in enumerate(self.folders, 1):
            print(f"\n{i}. {folder.name}")
            print(f"   Path: {folder.path}")
            print(f"   Documents: {folder.doc_count}")
            print(f"   Summary: {folder.summary}")
            if folder.embedding:
                print(f"   Embedding: {len(folder.embedding)} dimensions")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="ACEP Document Folder Router")
    parser.add_argument("--setup", action="store_true", help="Setup folders (create summaries and embeddings)")
    parser.add_argument("--query", type=str, help="Route a query to folders")
    parser.add_argument("--info", action="store_true", help="Display folder information")
    parser.add_argument("--test", action="store_true", help="Run test queries")
    
    args = parser.parse_args()
    
    router = FolderRouter()
    
    if args.setup:
        print("🚀 PHASE 3: Setting up Folder Routing System...")
        print("=" * 60)
        try:
            print("\n📝 Step 1: Creating folder summaries (1-3 lines each)...")
            router.create_folder_summaries()
            
            print("\n🧠 Step 2: Generating folder embeddings...")
            router.create_folder_embeddings()
            
            print("\n💾 Step 3: Saving to local SQLite database...")
            router.save_to_database()
            
            print("\n☁️  Step 4: Attempting Supabase integration...")
            router.create_supabase_folders_table()
            
            print("\n📊 Step 5: Displaying folder information...")
            router.display_folder_info()
            
            print("\n✅ PHASE 3 SETUP COMPLETED SUCCESSFULLY!")
            print("\nRouting Policy:")
            print(f"• Single folder: similarity > {SIMILARITY_THRESHOLD}")
            print(f"• Multi-folder: similarity > {MULTI_FOLDER_THRESHOLD} (top 2)")
            print("• LLM fallback: enabled for low confidence queries")
            
        except Exception as e:
            print(f"❌ Setup failed: {e}")
            import traceback
            traceback.print_exc()
        
    elif args.query:
        result = router.route_query(args.query)
        print(f"\nQuery: {args.query}")
        print(f"Selected folders: {result['selected_folders']}")
        print(f"Confidence: {result['confidence']}")
        print(f"Method: {result['method']}")
        if 'reasoning' in result:
            print(f"Reasoning: {result['reasoning']}")
        
    elif args.info:
        router.load_from_database()
        router.display_folder_info()
        
    elif args.test:
        test_queries = [
            # Single folder queries (high similarity)
            "board meeting minutes September 2025",
            "ACEP bylaws organizational structure", 
            "public statement CDC leadership",
            "policy on corporate practice of medicine",
            "council resolutions 2024",
            
            # Multi-folder queries (ambiguous)
            "show me all documents about emergency medicine",
            "governance and policy decisions",
            
            # Low confidence queries (LLM fallback candidates)
            "patient safety protocols",
            "financial oversight procedures"
        ]
        
        print("\n" + "="*60)
        print("PHASE 3 FOLDER ROUTING TESTS")
        print("="*60)
        
        for i, query in enumerate(test_queries, 1):
            result = router.route_query(query)
            print(f"\n{i}. Query: {query}")
            print(f"   → Decision: {result['routing_decision']}")
            print(f"   → Folders: {result['selected_folders']}")
            print(f"   → Confidence: {result['confidence']}")
            print(f"   → Top similarity: {result['top_similarity']:.3f}")
            if 'reason' in result:
                print(f"   → Reason: {result['reason']}")
            if result.get('method') == 'llm':
                print(f"   → LLM Reasoning: {result.get('reasoning', 'N/A')}")

if __name__ == "__main__":
    main()
