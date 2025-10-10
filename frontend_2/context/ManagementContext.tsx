'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import DocumentCacheService from '@/services/DocumentCacheService';
import { DocumentCategory, UploadedDoc, DocumentUploadData } from '@/lib/types';
import { config } from '@/lib/config';

interface ManagementContextValue {
  isCacheReady: boolean;
  isLoading: boolean;
  categories: DocumentCategory[];
  initializeCache: () => Promise<void>;
  getDocumentsByCategory: (categoryId: string) => UploadedDoc[];
  uploadDocument: (data: DocumentUploadData) => Promise<'ok' | 'invalid' | 'failed'>;
  deleteDocument: (documentTitle: string, category: string) => Promise<boolean>;
  addCategory: (name: string, description?: string) => void;
  addYearFolder: (categoryId: string, year: string) => void;
  removeYearFolder: (categoryId: string, year: string) => void;
}

const ManagementContext = createContext<ManagementContextValue | undefined>(undefined);

const defaultCategories: DocumentCategory[] = [
  {
    id: 'board-committee',
    name: 'Board and Committee Proceedings',
    description: 'Board meetings, committee proceedings, and governance documents',
    documentCount: 0
  },
  {
    id: 'bylaws-governance',
    name: 'Bylaws & Governance Policies',
    description: 'Organizational bylaws and governance policies',
    documentCount: 0
  },
  {
    id: 'external-advocacy',
    name: 'External Advocacy &  Communications',
    description: 'External communications and advocacy materials',
    documentCount: 0
  },
  {
    id: 'policy-statements',
    name: 'Policy & Position Statements',
    description: 'Official policy statements and position papers',
    documentCount: 0
  },
  {
    id: 'resolutions',
    name: 'Resolutions',
    description: 'Official resolutions and decisions',
    documentCount: 0
  }
];

export function ManagementProvider({ children }: { children: ReactNode }) {
  const [isCacheReady, setIsCacheReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState<DocumentCategory[]>(defaultCategories);

  const updateCategoryCounts = useCallback(() => {
    // Only update counts on client-side
    if (typeof window === 'undefined') return;
    
    setCategories(prevCategories => 
      prevCategories.map(category => ({
        ...category,
        documentCount: DocumentCacheService.getCachedCount(category.name)
      }))
    );
  }, []);

  useEffect(() => {
    // Only check cache on client-side
    if (typeof window === 'undefined') return;
    
    const cacheReady = DocumentCacheService.isCacheInitialized();
    setIsCacheReady(cacheReady);
    
    // Load year folders from localStorage
    try {
      const savedYearFolders = localStorage.getItem('shrone_year_folders');
      if (savedYearFolders) {
        const yearFoldersData = JSON.parse(savedYearFolders);
        console.log('📁 Loading year folders from localStorage:', yearFoldersData);
        
        setCategories(prevCategories => {
          return prevCategories.map(category => {
            const savedYears = yearFoldersData[category.id];
            if (savedYears && Array.isArray(savedYears)) {
              return {
                ...category,
                yearFolders: savedYears
              };
            }
            return category;
          });
        });
      }
    } catch (error) {
      console.error('❌ Failed to load year folders from localStorage:', error);
    }
    
    if (cacheReady) {
      updateCategoryCounts();
    }
  }, [updateCategoryCounts]);

  const initializeCache = useCallback(async () => {
    // Only run on client-side
    if (typeof window === 'undefined') return;
    
    if (DocumentCacheService.isCacheInitialized()) {
      setIsCacheReady(true);
      updateCategoryCounts();
      return;
    }

    setIsLoading(true);
    
    try {
      await DocumentCacheService.initializeCache();
      setIsCacheReady(true);
      updateCategoryCounts();
    } catch (err) {
      console.error('Cache initialization error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [updateCategoryCounts]);

  const getDocumentsByCategory = useCallback((categoryId: string) => {
    // Return empty array on server-side or if cache not ready
    if (typeof window === 'undefined' || !isCacheReady) return [];
    
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return [];
    
    const categoryName = category.name;
    const documents = DocumentCacheService.getCachedDocuments(categoryName);
    
    return documents.map((doc: any, index: number) => ({
      id: `${categoryId}-${index}`,
      name: doc.name || doc.filename || 'Unknown Document',
      sizeMB: doc.sizeMB || 0,
      type: doc.type || 'pdf',
      status: 'uploaded' as const,
      title: doc.title || doc.name || 'Unknown Document',
      category: categoryName,
      uploadedAt: doc.uploadedAt || new Date().toISOString(),
      filename: doc.filename || doc.name || 'unknown.pdf',
      source_file: doc.source_file || doc.filename || 'unknown.pdf',
      // Pass through date/year so UI can group into the correct year folder
      issueDate: doc.issueDate || doc.issued_date || doc.issue_date || null,
      year: typeof doc.year !== 'undefined' && doc.year !== null ? String(doc.year) : undefined
    }));
  }, [isCacheReady, categories]);

  const uploadDocument = useCallback(async (data: DocumentUploadData): Promise<'ok' | 'invalid' | 'failed'> => {
    try {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('category', data.category);
      formData.append('title', data.title);
      formData.append('document_number', ''); // Optional
      formData.append('issued_date', data.issueDate);
      formData.append('year', new Date(data.issueDate).getFullYear().toString());

      console.log('📤 Uploading document:', data.title, 'to category:', data.category);
      console.log('📤 Upload data:', {
        title: data.title,
        category: data.category,
        issueDate: data.issueDate,
        year: new Date(data.issueDate).getFullYear().toString()
      });

      // Get backend URL from config
      const backendUrl = config.backendUrl;
      const response = await fetch(`${backendUrl}/v1/upload-and-preprocess`, {
        method: 'POST',
        body: formData,
      });

      console.log('📡 Response status:', response.status, response.statusText);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Upload failed:', response.status, response.statusText);
        console.error('❌ Error details:', errorText);
        return 'failed';
      }

      const result = await response.json();
      console.log('✅ Upload successful:', result);

      // Check if embedding was successful
      if (result.embedding_result?.status === 'success') {
        console.log('🎉 Embeddings generated successfully:', result.embedding_result.chunks_stored, 'chunks');
      } else {
        console.warn('⚠️ Embedding generation had issues:', result.embedding_result?.message);
      }

      // Refresh cache after successful upload
      console.log('🔄 Refreshing cache...');
      await DocumentCacheService.refreshCache();
      await initializeCache(); // Update context state
      
      // Force update category counts to reflect new document
      updateCategoryCounts();
      console.log('✅ Cache refreshed successfully');

      return 'ok';
    } catch (error) {
      console.error('❌ Upload error:', error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.error('❌ Network error - is the backend server running?');
      }
      return 'failed';
    }
  }, [initializeCache]);

  const deleteDocument = useCallback(async (documentTitle: string, category: string): Promise<boolean> => {
    try {
      console.log('🗑️ Deleting document:', documentTitle, 'from category:', category);

      const formData = new FormData();
      formData.append('document_title', documentTitle);
      formData.append('category', category);

      // Get backend URL from config
      const backendUrl = config.backendUrl;
      const response = await fetch(`${backendUrl}/v1/delete-document`, {
        method: 'DELETE',
        body: formData,
      });

      if (!response.ok) {
        console.error('Delete failed:', response.status, response.statusText);
        return false;
      }

      const result = await response.json();
      console.log('✅ Delete successful:', result);

      // Check deletion results
      if (result.deletion_result?.status === 'success') {
        console.log('🎉 Embeddings deleted successfully:', result.deletion_result.chunks_deleted, 'chunks');
      } else if (result.deletion_result?.status === 'warning') {
        console.warn('⚠️ Document not found in embeddings:', result.deletion_result?.message);
      }

      // Refresh cache after successful deletion
      await DocumentCacheService.refreshCache();
      await initializeCache(); // Update context state

      return true;
    } catch (error) {
      console.error('Delete error:', error);
      return false;
    }
  }, [initializeCache]);

  const addCategory = useCallback((name: string, description?: string) => {
    const newCategory: DocumentCategory = {
      id: `custom-${Date.now()}`, // Generate unique ID
      name,
      description,
      documentCount: 0
    };
    
    setCategories(prevCategories => {
      // Check if category already exists
      if (prevCategories.some(cat => cat.name.toLowerCase() === name.toLowerCase())) {
        console.warn('Category already exists:', name);
        return prevCategories;
      }
      return [...prevCategories, newCategory];
    });
    
    console.log('✅ Category added:', newCategory);
  }, []);

  const addYearFolder = useCallback((categoryId: string, year: string) => {
    console.log('📁 Creating year folder for category:', categoryId, 'year:', year);
    
    setCategories(prevCategories => {
      const updatedCategories = prevCategories.map(category => {
        if (category.id === categoryId) {
          // Initialize yearFolders array if it doesn't exist
          const existingYears = category.yearFolders || [];
          
          // Check if year already exists
          if (existingYears.includes(year)) {
            console.warn('⚠️ Year folder already exists:', year, 'in category:', category.name);
            return category;
          }
          
          // Add the new year and sort in descending order
          const updatedYearFolders = [...existingYears, year]
            .sort((a, b) => parseInt(b) - parseInt(a));
          
          console.log('✅ Year folder added:', year, 'to category:', category.name);
          console.log('📁 Updated year folders:', updatedYearFolders);
          
          return {
            ...category,
            yearFolders: updatedYearFolders
          };
        }
        return category;
      });
      
      // Persist year folders to localStorage
      try {
        const yearFoldersData = updatedCategories.reduce((acc, category) => {
          if (category.yearFolders && category.yearFolders.length > 0) {
            acc[category.id] = category.yearFolders;
          }
          return acc;
        }, {} as Record<string, string[]>);
        
        localStorage.setItem('shrone_year_folders', JSON.stringify(yearFoldersData));
        console.log('💾 Year folders persisted to localStorage:', yearFoldersData);
      } catch (error) {
        console.error('❌ Failed to persist year folders:', error);
      }
      
      return updatedCategories;
    });
  }, []);

  const removeYearFolder = useCallback((categoryId: string, year: string) => {
    console.log('🗑️ Removing year folder for category:', categoryId, 'year:', year);
    
    setCategories(prevCategories => {
      const updatedCategories = prevCategories.map(category => {
        if (category.id === categoryId) {
          const existingYears = category.yearFolders || [];
          const updatedYearFolders = existingYears.filter(y => y !== year);
          
          console.log('✅ Year folder removed:', year, 'from category:', category.name);
          console.log('📁 Updated year folders:', updatedYearFolders);
          
          return {
            ...category,
            yearFolders: updatedYearFolders
          };
        }
        return category;
      });
      
      // Persist year folders to localStorage
      try {
        const yearFoldersData = updatedCategories.reduce((acc, category) => {
          if (category.yearFolders && category.yearFolders.length > 0) {
            acc[category.id] = category.yearFolders;
          }
          return acc;
        }, {} as Record<string, string[]>);
        
        localStorage.setItem('shrone_year_folders', JSON.stringify(yearFoldersData));
        console.log('💾 Year folders updated in localStorage:', yearFoldersData);
      } catch (error) {
        console.error('❌ Failed to persist year folders:', error);
      }
      
      return updatedCategories;
    });
  }, []);

  const value: ManagementContextValue = {
    isCacheReady,
    isLoading,
    categories,
    initializeCache,
    getDocumentsByCategory,
    uploadDocument,
    deleteDocument,
    addCategory,
    addYearFolder,
    removeYearFolder
  };

  return (
    <ManagementContext.Provider value={value}>
      {children}
    </ManagementContext.Provider>
  );
}

export const useManagement = () => {
  const context = useContext(ManagementContext);
  if (!context) {
    throw new Error('useManagement must be used within ManagementProvider');
  }
  return context;
};