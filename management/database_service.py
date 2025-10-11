"""
Database Service for Management System
Handles Supabase operations for year folders and document organization
"""

import os
from typing import List, Dict, Optional
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

class DatabaseService:
    """Service for database operations related to year folders and document management"""
    
    def __init__(self):
        """Initialize Supabase client"""
        self.url = os.environ.get("SUPABASE_URL")
        self.key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
        
        if not self.url or not self.key:
            raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
        
        self.client: Client = create_client(self.url, self.key)
    
    def get_documents_by_category(self, category: str) -> List[Dict]:
        """
        Get all documents for a category using the existing main.py endpoint
        
        Args:
            category: Category name
            
        Returns:
            List of document dictionaries with metadata
        """
        try:
            import requests
            
            # Use the existing endpoint from main.py
            backend_url = os.environ.get("BACKEND_URL", "http://localhost:8000")
            response = requests.get(f"{backend_url}/documents_by_category/{category}")
            
            if response.status_code != 200:
                print(f"❌ Error fetching documents: {response.status_code}")
                return []
            
            data = response.json()
            documents = data.get("documents", [])
            
            print(f"✅ Retrieved {len(documents)} documents for category: {category}")
            return documents
            
        except Exception as e:
            print(f"❌ Error retrieving documents for category {category}: {e}")
            return []
    
    def get_available_years_by_category(self, category: str) -> List[str]:
        """
        Get all available years for a category based on existing documents
        
        Args:
            category: Category name
            
        Returns:
            List of years (as strings) sorted in descending order
        """
        try:
            documents = self.get_documents_by_category(category)
            
            # Extract unique years from documents
            years = set()
            for doc in documents:
                year = doc.get("year")
                if year:
                    # Handle both string and integer years
                    year_str = str(year)
                    years.add(year_str)
            
            # Convert to sorted list (newest first)
            sorted_years = sorted(years, key=lambda x: int(x), reverse=True)
            print(f"✅ Found years for {category}: {sorted_years}")
            return sorted_years
            
        except Exception as e:
            print(f"❌ Error getting years for category {category}: {e}")
            return []
    
    def get_documents_by_category_and_year(self, category: str, year: str) -> List[Dict]:
        """
        Get documents for a specific category and year
        
        Args:
            category: Category name
            year: Year as string
            
        Returns:
            List of documents for that year
        """
        try:
            documents = self.get_documents_by_category(category)
            
            # Filter by year - handle both string and integer years
            year_documents = [
                doc for doc in documents 
                if str(doc.get("year", "")) == str(year)
            ]
            
            print(f"✅ Found {len(year_documents)} documents for {category}/{year}")
            return year_documents
            
        except Exception as e:
            print(f"❌ Error getting documents for {category}/{year}: {e}")
            return []
    
    def get_category_structure(self, category: str) -> Dict:
        """
        Get complete structure for a category including years and document counts
        
        Args:
            category: Category name
            
        Returns:
            Dictionary with category structure
        """
        try:
            years = self.get_available_years_by_category(category)
            
            structure = {
                "category": category,
                "years": [],
                "total_documents": 0
            }
            
            for year in years:
                year_docs = self.get_documents_by_category_and_year(category, year)
                structure["years"].append({
                    "year": year,
                    "document_count": len(year_docs),
                    "documents": year_docs
                })
                structure["total_documents"] += len(year_docs)
            
            print(f"✅ Category structure for {category}: {len(years)} years, {structure['total_documents']} total documents")
            return structure
            
        except Exception as e:
            print(f"❌ Error getting category structure for {category}: {e}")
            return {
                "category": category,
                "years": [],
                "total_documents": 0
            }
