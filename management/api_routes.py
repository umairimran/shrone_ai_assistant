"""
API Routes for Management System
Handles year folder synchronization and document organization endpoints
"""

from fastapi import APIRouter, HTTPException
from typing import List, Dict
from .year_folder_manager import YearFolderManager

# Create router for management endpoints
router = APIRouter(prefix="/management", tags=["management"])

# Initialize year folder manager
year_manager = YearFolderManager()

@router.get("/categories/{category}/years")
async def get_category_years(category: str) -> Dict:
    """
    Get all available years for a category from database
    
    Args:
        category: Category name
        
    Returns:
        Dictionary with years and document counts
    """
    try:
        structure = year_manager.get_category_structure(category)
        return {
            "category": category,
            "years": structure["years"],
            "total_documents": structure["total_documents"],
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting years for category {category}: {str(e)}")

@router.get("/categories/{category}/years/{year}/documents")
async def get_documents_for_year(category: str, year: str) -> Dict:
    """
    Get documents for a specific category and year
    
    Args:
        category: Category name
        year: Year as string
        
    Returns:
        Dictionary with documents for that year
    """
    try:
        documents = year_manager.get_documents_for_year(category, year)
        return {
            "category": category,
            "year": year,
            "documents": documents,
            "count": len(documents),
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting documents for {category}/{year}: {str(e)}")

@router.get("/categories/structure")
async def get_all_categories_structure() -> Dict:
    """
    Get structure for all categories with years and document counts
    
    Returns:
        Dictionary with all category structures
    """
    try:
        structures = year_manager.get_all_categories_structure()
        return {
            "categories": structures,
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting category structures: {str(e)}")

@router.post("/categories/{category}/sync")
async def sync_category_years(category: str) -> Dict:
    """
    Synchronize year folders for a category based on database content
    
    Args:
        category: Category name
        
    Returns:
        Dictionary with synchronized years
    """
    try:
        years = year_manager.sync_year_folders(category)
        return {
            "category": category,
            "years": years,
            "count": len(years),
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error synchronizing years for {category}: {str(e)}")

@router.get("/categories/{category}/years/sync")
async def get_synced_years(category: str) -> Dict:
    """
    Get synchronized years for a category (alias for get_category_years)
    
    Args:
        category: Category name
        
    Returns:
        Dictionary with synchronized years
    """
    return await get_category_years(category)
