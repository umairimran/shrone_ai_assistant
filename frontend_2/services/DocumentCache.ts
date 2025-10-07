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
  'Bylaws & Governance Policies', 
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
      // Get backend URL from environment variable or use localhost for development
      const backendUrl = (typeof window !== 'undefined' ? (window as any).ENV?.NEXT_PUBLIC_BACKEND_URL : process.env.NEXT_PUBLIC_BACKEND_URL) || 'http://localhost:8000';
      console.log(`🌐 Using backend URL: ${backendUrl}`);
      
      // Call API for each category
      for (const category of categories) {
        console.log(`📥 Fetching documents for: ${category}`);
        
        try {
          const response = await fetch(`${backendUrl}/documents_by_category/${encodeURIComponent(category)}`);
          
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