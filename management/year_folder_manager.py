"""
Year Folder Manager
Handles year folder synchronization between database and frontend
"""

from typing import List, Dict, Optional
from .database_service import DatabaseService

class YearFolderManager:
    """Manages year folder synchronization and organization"""
    
    def __init__(self):
        """Initialize with database service"""
        self.db_service = DatabaseService()
    
    def get_category_years(self, category: str) -> List[str]:
        """
        Get all available years for a category from database
        
        Args:
            category: Category name
            
        Returns:
            List of years sorted in descending order (newest first)
        """
        try:
            years = self.db_service.get_available_years_by_category(category)
            print(f"📁 Retrieved {len(years)} years for category: {category}")
            return years
        except Exception as e:
            print(f"❌ Error getting years for category {category}: {e}")
            return []
    
    def get_category_structure(self, category: str) -> Dict:
        """
        Get complete category structure with years and document counts
        
        Args:
            category: Category name
            
        Returns:
            Dictionary with category structure
        """
        try:
            structure = self.db_service.get_category_structure(category)
            print(f"📊 Category structure for {category}: {len(structure['years'])} years")
            return structure
        except Exception as e:
            print(f"❌ Error getting category structure for {category}: {e}")
            return {
                "category": category,
                "years": [],
                "total_documents": 0
            }
    
    def get_all_categories_structure(self) -> Dict[str, Dict]:
        """
        Get structure for all categories
        
        Returns:
            Dictionary mapping category names to their structures
        """
        categories = [
            "Board and Committee Proceedings",
            "Bylaws & Governance Policies", 
            "External Advocacy &  Communications",
            "Policy & Position Statements",
            "Resolutions"
        ]
        
        all_structures = {}
        
        for category in categories:
            try:
                structure = self.get_category_structure(category)
                all_structures[category] = structure
            except Exception as e:
                print(f"❌ Error getting structure for {category}: {e}")
                all_structures[category] = {
                    "category": category,
                    "years": [],
                    "total_documents": 0
                }
        
        print(f"📊 Retrieved structures for {len(all_structures)} categories")
        return all_structures
    
    def sync_year_folders(self, category: str) -> List[str]:
        """
        Synchronize year folders for a category based on database content
        
        Args:
            category: Category name
            
        Returns:
            List of synchronized years
        """
        try:
            years = self.get_category_years(category)
            print(f"🔄 Synchronized {len(years)} year folders for {category}")
            return years
        except Exception as e:
            print(f"❌ Error synchronizing year folders for {category}: {e}")
            return []
    
    def get_documents_for_year(self, category: str, year: str) -> List[Dict]:
        """
        Get documents for a specific category and year
        
        Args:
            category: Category name
            year: Year as string
            
        Returns:
            List of documents for that year
        """
        try:
            documents = self.db_service.get_documents_by_category_and_year(category, year)
            print(f"📄 Retrieved {len(documents)} documents for {category}/{year}")
            return documents
        except Exception as e:
            print(f"❌ Error getting documents for {category}/{year}: {e}")
            return []
