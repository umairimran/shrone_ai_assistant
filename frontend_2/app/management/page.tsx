'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { HierarchicalTree } from '@/components/Management/HierarchicalTree';
import { UploadDocumentModal } from '@/components/Management/UploadDocumentModal';
import { ManagementProvider, useManagement } from '@/context/ManagementContext';
import DocumentCacheService from '@/services/DocumentCacheService';
import { testBackendConnection, testDocumentsEndpoint } from '@/lib/testBackend';


function ManagementPageContent() {
  const { 
    isCacheReady, 
    isLoading, 
    categories,
    initializeCache,
    uploadDocument,
    deleteDocument,
    getDocumentsByCategory
  } = useManagement();
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadContext, setUploadContext] = useState<{categoryId: string, year?: string} | null>(null);
  const [isClient, setIsClient] = useState(false);

  // Handle client-side hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Initialize cache on component mount (client-side only)
  useEffect(() => {
    if (!isClient) return;
    
    const initCache = async () => {
      if (!DocumentCacheService.isCacheInitialized()) {
        
        // Test backend connection first
        const backendOk = await testBackendConnection();
        if (!backendOk) {
          console.error('❌ Backend connection failed, cannot initialize cache');
          return;
        }
        
        // Test documents endpoint
        const documentsOk = await testDocumentsEndpoint();
        if (!documentsOk) {
          console.error('❌ Documents endpoint failed, cannot initialize cache');
          return;
        }
        
        await DocumentCacheService.initializeCache();
        initializeCache(); // Update context state
      }
    };
    
    initCache();
  }, [initializeCache, isClient]);

  const handleTreeUploadDocument = (categoryId: string, year?: string) => {
    const category = categories.find(cat => cat.id === categoryId);
    if (category) {
      setUploadContext({ categoryId, year });
      setShowUploadModal(true);
    }
  };

  const handleGeneralUploadClick = () => {
    setUploadContext(null); // No category pre-selected
    setShowUploadModal(true);
  };

  const handleUploadModalClose = () => {
    setShowUploadModal(false);
    setUploadContext(null);
  };

  const handleDeleteDocument = async (documentId: string): Promise<boolean> => {
    try {
      // Find the document across all categories since we're using a tree structure
      let targetDocument = null;
      let targetCategory = null;

      for (const category of categories) {
        const documents = getDocumentsByCategory(category.id);
        const document = documents.find(doc => doc.id === documentId);
        if (document) {
          targetDocument = document;
          targetCategory = category;
          break;
        }
      }
      
      if (!targetDocument || !targetCategory) {
        console.error('Document not found:', documentId);
        return false;
      }

      console.log('🗑️ Deleting document:', targetDocument.title, 'from category:', targetCategory.name);
      
      // Call the delete function with title and category
      const success = await deleteDocument(targetDocument.title || targetDocument.name, targetCategory.name);
      
      return success;
    } catch (error) {
      console.error('Error in handleDeleteDocument:', error);
      return false;
    }
  };

  // Show loading state during hydration
  if (!isClient || isLoading || !isCacheReady) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Chat
            </Link>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Document Management
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Upload, organize, and manage your documents
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGeneralUploadClick}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Upload Document
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Document Library
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Browse and manage your documents in a hierarchical structure organized by category and year.
            </p>
          </div>

          {/* Document Tree */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <HierarchicalTree
              onDocumentSelect={(document) => {
                console.log('Document selected:', document);
                // TODO: Implement document viewing/preview
              }}
              onDocumentDelete={handleDeleteDocument}
              onUploadDocument={handleTreeUploadDocument}
            />
          </div>
        </div>
      </main>

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadDocumentModal
          isOpen={showUploadModal}
          onClose={handleUploadModalClose}
          onUpload={uploadDocument}
          categories={categories}
          selectedCategoryId={uploadContext?.categoryId || null}
        />
      )}
    </div>
  );
}

export default function ManagementPage() {
  return (
    <ManagementProvider>
      <ManagementPageContent />
    </ManagementProvider>
  );
}
