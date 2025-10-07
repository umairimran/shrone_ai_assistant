'use client';

import { Document, DocumentsResponse } from '@/lib/types';
import { config, debugConfig } from '@/lib/config';

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
    console.log('🔄 [CACHE] INITIALIZING CACHE - Calling all category APIs...');
    
    // Debug environment variables
    debugConfig();
    
    const cacheData: CategoryData = {};
    
    try {
      // Get backend URL from config
      const backendUrl = config.backendUrl;
      console.log(`🌐 [CACHE] Using backend URL: ${backendUrl}`);
      
      // Call API for each category
      for (const category of categories) {
        console.log(`📥 [CACHE] Fetching documents for: ${category}`);
        
        try {
          const url = `${backendUrl}/documents_by_category/${encodeURIComponent(category)}`;
          console.log(`🌐 [CACHE] Request URL: ${url}`);
          
          const response = await fetch(url);
          console.log(`📡 [CACHE] Response status for ${category}: ${response.status} ${response.statusText}`);
          
          if (response.ok) {
            const data: DocumentsResponse = await response.json();
            console.log(`📄 [CACHE] Raw response data for ${category}:`, JSON.stringify(data, null, 2));
            
            cacheData[category] = {
              documents: data.documents || [],
              count: (data.documents || []).length,
              lastUpdated: new Date().toISOString()
            };
            console.log(`✅ [CACHE] Cached ${cacheData[category].count} documents for ${category}`);
          } else {
            const errorText = await response.text();
            console.error(`❌ [CACHE] Failed to fetch ${category}: ${response.status} ${response.statusText}`);
            console.error(`❌ [CACHE] Error response: ${errorText}`);
            cacheData[category] = { 
              documents: [], 
              count: 0, 
              lastUpdated: new Date().toISOString() 
            };
          }
        } catch (categoryError) {
          console.error(`❌ [CACHE] Error fetching ${category}:`, categoryError);
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