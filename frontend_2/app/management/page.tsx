'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { CategoryCard } from '@/components/Management/CategoryCard';
import { DocumentItem } from '@/components/Management/DocumentItem';
import { UploadDocumentModal } from '@/components/Management/UploadDocumentModal';
import { ManagementProvider, useManagement } from '@/context/ManagementContext';
import DocumentCacheService from '@/services/DocumentCacheService';

// Component that uses the cache
function ViewingCategoryDocuments({ 
  categoryId, 
  onDeleteDocument 
}: { 
  categoryId: string;
  onDeleteDocument: (documentId: string) => Promise<boolean>;
}) {
  const { getDocumentsByCategory, isLoading } = useManagement();
  
  const documents = getDocumentsByCategory(categoryId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading documents...</span>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 mb-2">📄</div>
        <p className="text-gray-600 dark:text-gray-400">No documents found in this category</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Found {documents.length} {documents.length === 1 ? 'document' : 'documents'}
      </div>
      {documents.map((document, index) => (
        <DocumentItem
          key={document.id || index}
          document={document}
          onDelete={onDeleteDocument}
        />
      ))}
    </div>
  );
}

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
  
  const [viewingCategory, setViewingCategory] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCategoryId, setUploadCategoryId] = useState<string | null>(null);
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
        console.log('🚀 Initializing cache on page load...');
        await DocumentCacheService.initializeCache();
        initializeCache(); // Update context state
      }
    };
    
    initCache();
  }, [initializeCache, isClient]);

  const handleViewDocuments = (categoryId: string) => {
    if (!isClient || !DocumentCacheService.isCacheInitialized()) {
      console.log('⏳ Cache not ready, initializing...');
      initializeCache();
      return;
    }
    setViewingCategory(categoryId);
  };

  const handleUploadClick = (categoryId: string) => {
    setUploadCategoryId(categoryId);
    setShowUploadModal(true);
  };

  const handleGeneralUploadClick = () => {
    setUploadCategoryId(null); // No category pre-selected
    setShowUploadModal(true);
  };

  const handleUploadModalClose = () => {
    setShowUploadModal(false);
    setUploadCategoryId(null);
  };

  const handleDeleteDocument = async (documentId: string): Promise<boolean> => {
    try {
      // Extract document info from the ID and current viewing context
      // The documentId format is like "categoryId-index", but we need the actual document data
      // Let's find the document in the current category being viewed
      
      if (!viewingCategory) {
        console.error('No category selected for deletion');
        return false;
      }

      const documents = getDocumentsByCategory(viewingCategory);
      const document = documents.find(doc => doc.id === documentId);
      
      if (!document) {
        console.error('Document not found:', documentId);
        return false;
      }

      // Get category name from the document or from the current category
      const categoryName = document.category || categories.find(cat => cat.id === viewingCategory)?.name;
      
      if (!categoryName) {
        console.error('Could not determine category for document');
        return false;
      }

      console.log('🗑️ Deleting document:', document.title, 'from category:', categoryName);
      
      // Call the delete function with title and category
      const success = await deleteDocument(document.title || document.name, categoryName);
      
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
            Loading document cache...
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
            {/* Cache Status Indicator */}
            <div className="flex items-center gap-2">
              {isClient && DocumentCacheService.isCacheInitialized() ? (
                <>
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-600">Cache Ready</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-yellow-600">Initializing...</span>
                </>
              )}
            </div>
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
              Document Categories
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Select a category to view and manage documents, or upload new documents.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                isSelected={false}
                onSelect={() => {}}
                onUpload={() => handleUploadClick(category.id)}
                onViewDocuments={() => handleViewDocuments(category.id)}
              />
            ))}
          </div>

          {/* Document List for Viewing Category */}
          {viewingCategory && (
            <div className="mt-8 bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Documents in {categories.find(cat => cat.id === viewingCategory)?.name}
                </h3>
                <button
                  onClick={() => setViewingCategory(null)}
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <ViewingCategoryDocuments 
                categoryId={viewingCategory}
                onDeleteDocument={handleDeleteDocument}
              />
            </div>
          )}
        </div>
      </main>

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadDocumentModal
          isOpen={showUploadModal}
          onClose={handleUploadModalClose}
          onUpload={uploadDocument}
          categories={categories}
          selectedCategoryId={uploadCategoryId}
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
