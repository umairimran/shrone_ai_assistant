/**
 * Year Folder Service
 * Handles year folder synchronization with backend database
 */

import { config } from '@/lib/config';

export interface YearFolder {
  year: string;
  documentCount: number;
  documents: any[];
}

export interface CategoryStructure {
  category: string;
  years: YearFolder[];
  total_documents: number;
}

export interface YearFolderResponse {
  category: string;
  years: YearFolder[];
  total_documents: number;
  status: string;
}

export interface DocumentsResponse {
  category: string;
  year: string;
  documents: any[];
  count: number;
  status: string;
}

class YearFolderService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.backendUrl;
  }

  /**
   * Get all available years for a category from database using existing endpoint
   */
  async getCategoryYears(category: string): Promise<YearFolderResponse> {
    try {
      console.log(`📁 Fetching years for category: ${category}`);
      
      // Use the existing documents_by_category endpoint
      const response = await fetch(`${this.baseUrl}/documents_by_category/${encodeURIComponent(category)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch documents for category ${category}: ${response.statusText}`);
      }

      const data = await response.json();
      const documents = data.documents || [];
      
      // Extract unique years from documents
      const years = new Set<string>();
      documents.forEach((doc: any) => {
        const year = doc.year;
        if (year) {
          years.add(String(year));
        }
      });
      
      // Convert to sorted array (newest first)
      const sortedYears = Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
      
      // Create year folders with document counts
      const yearFolders = sortedYears.map(year => {
        const yearDocs = documents.filter((doc: any) => String(doc.year) === year);
        return {
          year,
          documentCount: yearDocs.length,
          documents: yearDocs
        };
      });
      
      const result = {
        category,
        years: yearFolders,
        total_documents: documents.length,
        status: 'success'
      };
      
      console.log(`✅ Retrieved ${sortedYears.length} years for ${category}:`, sortedYears);
      return result;
    } catch (error) {
      console.error(`❌ Error fetching years for category ${category}:`, error);
      throw error;
    }
  }

  /**
   * Get documents for a specific category and year using existing endpoint
   */
  async getDocumentsForYear(category: string, year: string): Promise<DocumentsResponse> {
    try {
      console.log(`📄 Fetching documents for ${category}/${year}`);
      
      // Use the existing documents_by_category endpoint
      const response = await fetch(`${this.baseUrl}/documents_by_category/${encodeURIComponent(category)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch documents for category ${category}: ${response.statusText}`);
      }

      const data = await response.json();
      const documents = data.documents || [];
      
      // Filter documents by year
      const yearDocuments = documents.filter((doc: any) => String(doc.year) === year);
      
      const result = {
        category,
        year,
        documents: yearDocuments,
        count: yearDocuments.length,
        status: 'success'
      };
      
      console.log(`✅ Retrieved ${yearDocuments.length} documents for ${category}/${year}`);
      return result;
    } catch (error) {
      console.error(`❌ Error fetching documents for ${category}/${year}:`, error);
      throw error;
    }
  }

  /**
   * Get structure for all categories
   */
  async getAllCategoriesStructure(): Promise<{ categories: Record<string, CategoryStructure>, status: string }> {
    try {
      console.log('📊 Fetching structure for all categories');
      
      const response = await fetch(`${this.baseUrl}/management/categories/structure`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch category structures: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ Retrieved structures for ${Object.keys(data.categories || {}).length} categories`);
      return data;
    } catch (error) {
      console.error('❌ Error fetching category structures:', error);
      throw error;
    }
  }

  /**
   * Synchronize year folders for a category using existing endpoint
   */
  async syncCategoryYears(category: string): Promise<YearFolderResponse> {
    try {
      console.log(`🔄 Synchronizing years for category: ${category}`);
      
      // Use the existing documents_by_category endpoint to get fresh data
      const response = await fetch(`${this.baseUrl}/documents_by_category/${encodeURIComponent(category)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch documents for category ${category}: ${response.statusText}`);
      }

      const data = await response.json();
      const documents = data.documents || [];
      
      console.log(`📊 API Response for ${category}:`, {
        totalDocuments: documents.length,
        documents: documents.map(doc => ({ title: doc.title, year: doc.year }))
      });
      
      // Extract unique years from documents
      const years = new Set<string>();
      documents.forEach((doc: any) => {
        const year = doc.year;
        if (year) {
          years.add(String(year));
        }
      });
      
      // Convert to sorted array (newest first)
      const sortedYears = Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
      
      console.log(`📁 Extracted years for ${category}:`, sortedYears);
      
      // Create year folders with document counts
      const yearFolders = sortedYears.map(year => {
        const yearDocs = documents.filter((doc: any) => String(doc.year) === year);
        return {
          year,
          documentCount: yearDocs.length,
          documents: yearDocs
        };
      });
      
      const result = {
        category,
        years: yearFolders,
        total_documents: documents.length,
        status: 'success'
      };
      
      console.log(`✅ Synchronized ${sortedYears.length} years for ${category}:`, sortedYears);
      console.log(`📂 Year folders created:`, yearFolders.map(yf => `${yf.year} (${yf.documentCount} docs)`));
      return result;
    } catch (error) {
      console.error(`❌ Error synchronizing years for category ${category}:`, error);
      throw error;
    }
  }

  /**
   * Get synchronized years for a category using existing endpoint
   */
  async getSyncedYears(category: string): Promise<YearFolderResponse> {
    try {
      console.log(`📁 Getting synced years for category: ${category}`);
      
      // Use the existing documents_by_category endpoint
      const response = await fetch(`${this.baseUrl}/documents_by_category/${encodeURIComponent(category)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch documents for category ${category}: ${response.statusText}`);
      }

      const data = await response.json();
      const documents = data.documents || [];
      
      // Extract unique years from documents
      const years = new Set<string>();
      documents.forEach((doc: any) => {
        const year = doc.year;
        if (year) {
          years.add(String(year));
        }
      });
      
      // Convert to sorted array (newest first)
      const sortedYears = Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
      
      // Create year folders with document counts
      const yearFolders = sortedYears.map(year => {
        const yearDocs = documents.filter((doc: any) => String(doc.year) === year);
        return {
          year,
          documentCount: yearDocs.length,
          documents: yearDocs
        };
      });
      
      const result = {
        category,
        years: yearFolders,
        total_documents: documents.length,
        status: 'success'
      };
      
      console.log(`✅ Retrieved ${sortedYears.length} synced years for ${category}:`, sortedYears);
      return result;
    } catch (error) {
      console.error(`❌ Error getting synced years for category ${category}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const yearFolderService = new YearFolderService();
export default yearFolderService;
