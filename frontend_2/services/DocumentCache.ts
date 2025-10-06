'use client';

import { Document, DocumentsResponse } from '@/lib/types';

interface CategoryData {
  [category: string]: {
    documents: Document[];
    count: number;
    lastUpdated: string;
  };
}

const categories = [
  'Board and Committee Proceedings',
  'By-Laws & Governance Policies', 
  'External Advocacy &  Communications',
  'Policy & Position Statements',
  'Resolutions'
];

class DocumentCacheService {
  private static readonly CACHE_KEY = 'acep_documents_cache';
  private static readonly FLAG_KEY = 'acep_cache_initialized';
  
  // Check if cache is initialized (THE FLAG)
  static isCacheInitialized(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(this.FLAG_KEY) === 'true';
  }

  // Set cache as initialized (SET THE FLAG)
  static setCacheInitialized(value: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.FLAG_KEY, value.toString());
    console.log(`🚩 Cache flag set to: ${value}`);
  }

  // Get cached documents for a category (FROM JSON)
  static getCachedDocuments(category: string): Document[] {
    if (typeof window === 'undefined') return [];
    
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) return [];
      
      const data: CategoryData = JSON.parse(cached);
      return data[category]?.documents || [];
    } catch (error) {
      console.error('Error reading cache:', error);
      return [];
    }
  }

  // Get document count for a category (FROM JSON)
  static getCachedCount(category: string): number {
    if (typeof window === 'undefined') return 0;
    
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) return 0;
      
      const data: CategoryData = JSON.parse(cached);
      return data[category]?.count || 0;
    } catch (error) {
      console.error('Error reading cache:', error);
      return 0;
    }
  }

  // Get all cached data
  static getAllCachedData(): CategoryData {
    if (typeof window === 'undefined') return {};
    
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) return {};
      
      return JSON.parse(cached);
    } catch (error) {
      console.error('Error reading cache:', error);
      return {};
    }
  }

  // Initialize cache by calling ALL category APIs ONCE
  static async initializeCache(): Promise<void> {
    console.log('🔄 INITIALIZING CACHE - Calling all category APIs...');
    
    const cacheData: CategoryData = {};
    
    try {
      // Call API for each category
      for (const category of categories) {
        console.log(`📥 Fetching documents for: ${category}`);
        
        try {
          const response = await fetch(`http://localhost:8000/documents_by_category/${encodeURIComponent(category)}`);
          
          if (response.ok) {
            const data: DocumentsResponse = await response.json();
            cacheData[category] = {
              documents: data.documents || [],
              count: (data.documents || []).length,
              lastUpdated: new Date().toISOString()
            };
            console.log(`✅ Cached ${cacheData[category].count} documents for ${category}`);
          } else {
            console.error(`❌ Failed to fetch ${category}:`, response.status);
            cacheData[category] = { 
              documents: [], 
              count: 0, 
              lastUpdated: new Date().toISOString() 
            };
          }
        } catch (categoryError) {
          console.error(`❌ Error fetching ${category}:`, categoryError);
          cacheData[category] = { 
            documents: [], 
            count: 0, 
            lastUpdated: new Date().toISOString() 
          };
        }

        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Save JSON to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
        this.setCacheInitialized(true); // SET FLAG TO TRUE
      }
      
      console.log('✅ CACHE INITIALIZATION COMPLETE - Flag set to TRUE');
      
    } catch (error) {
      console.error('❌ Cache initialization failed:', error);
      this.setCacheInitialized(false); // ENSURE FLAG IS FALSE ON ERROR
      throw error;
    }
  }

  // Clear cache (called on upload/delete) - RESET FLAG TO FALSE
  static clearCache(): void {
    console.log('🗑️ CLEARING CACHE - Setting flag to FALSE');
    if (typeof window === 'undefined') return;
    
    localStorage.removeItem(this.CACHE_KEY);
    this.setCacheInitialized(false); // RESET FLAG TO FALSE
  }

  // Refresh cache after upload/delete - CLEAR THEN REINITIALIZE
  static async refreshCache(): Promise<void> {
    console.log('🔄 REFRESHING CACHE - Clear then reinitialize');
    this.clearCache(); // Flag becomes FALSE
    await this.initializeCache(); // Call APIs again, flag becomes TRUE
  }

  // Get cache info for debugging
  static getCacheInfo(): any {
    const initialized = this.isCacheInitialized();
    const data = this.getAllCachedData();
    
    const info: any = {
      isInitialized: initialized,
      totalCategories: Object.keys(data).length,
      categories: {}
    };

    for (const [category, categoryData] of Object.entries(data)) {
      info.categories[category] = {
        documentCount: categoryData.count,
        lastUpdated: categoryData.lastUpdated
      };
    }

    return info;
  }
}

export default DocumentCacheService;
  
  const fileName = getCategoryFileName(category);
  const data = {
    category,
    documents,
    cachedAt: new Date().toISOString(),
    count: documents.length
  };
  
  localStorage.setItem(`documents_${fileName}`, JSON.stringify(data));
  console.log(`Cached ${documents.length} documents for category: ${category}`);
}

// Fetch all documents from API and cache them
async function fetchAndCacheAllDocuments(): Promise<void> {
  console.log('Fetching and caching documents for all categories...');
  
  for (const category of categories) {
    try {
      console.log(`Fetching documents for: ${category}`);
      
      const response = await fetch(`/api/documents?category=${encodeURIComponent(category)}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch documents for ${category}: ${response.statusText}`);
      }
      
      const responseData: DocumentsResponse = await response.json();
      const documents = responseData.documents || [];
      
      saveCachedDocuments(category, documents);
      
      console.log(`✓ Cached ${documents.length} documents for ${category}`);
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Error fetching documents for ${category}:`, error);
      // Save empty array if there's an error
      saveCachedDocuments(category, []);
    }
  }
  
  console.log('✓ All categories cached successfully');
}

// Get documents for a category (from cache or fetch if needed)
async function getDocumentsForCategory(category: string): Promise<Document[]> {
  // Try to get from cache first
  const cached = getCachedDocuments(category);
  if (cached !== null) {
    console.log(`Using cached documents for ${category}: ${cached.length} documents`);
    return cached;
  }
  
  // If not cached, fetch and cache all categories
  console.log(`No cached data found. Fetching all categories...`);
  await fetchAndCacheAllDocuments();
  
  // Now get from cache
  const newCached = getCachedDocuments(category);
  return newCached || [];
}

// Get all cached documents grouped by category
function getAllCachedDocuments(): Record<string, Document[]> {
  const result: Record<string, Document[]> = {};
  
  for (const category of categories) {
    const documents = getCachedDocuments(category);
    if (documents) {
      result[category] = documents;
    }
  }
  
  return result;
}

// Clear all cached documents
function clearDocumentCache(): void {
  if (typeof window === 'undefined') return;
  
  for (const category of categories) {
    const fileName = getCategoryFileName(category);
    localStorage.removeItem(`documents_${fileName}`);
  }
  
  console.log('Document cache cleared');
}

// Get cache info for debugging
function getCacheInfo(): Array<{category: string, count: number, cachedAt: string}> {
  const info: Array<{category: string, count: number, cachedAt: string}> = [];
  
  for (const category of categories) {
    const fileName = getCategoryFileName(category);
    const cached = localStorage.getItem(`documents_${fileName}`);
    
    if (cached) {
      try {
        const data = JSON.parse(cached);
        info.push({
          category,
          count: data.count || 0,
          cachedAt: data.cachedAt || 'Unknown'
        });
      } catch (error) {
        console.error(`Error parsing cache info for ${category}:`, error);
      }
    }
  }
  
  return info;
}

export const DocumentCache = {
  categories,
  hasCachedData,
  getCachedDocuments,
  saveCachedDocuments,
  fetchAndCacheAllDocuments,
  getDocumentsForCategory,
  getAllCachedDocuments,
  clearDocumentCache,
  getCacheInfo
};
