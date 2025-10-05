'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { UploadedDoc } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { SearchFilters } from './SearchFilters';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/components/mobile/MobileEnhancements';

interface DocumentLibraryProps {
  documents: UploadedDoc[];
  isLoading?: boolean;
  onDocumentSelect?: (document: UploadedDoc) => void;
  onDocumentDelete?: (documentId: string) => void;
  onUpload?: () => void;
  className?: string;
}

type ViewMode = 'grid' | 'list' | 'analytics';

export function DocumentLibrary({
  documents = [],
  isLoading = false,
  onDocumentSelect,
  onDocumentDelete,
  onUpload,
  className
}: DocumentLibraryProps) {
  const [filteredDocuments, setFilteredDocuments] = useState<UploadedDoc[]>(documents);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedDocument, setSelectedDocument] = useState<UploadedDoc | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'status' | 'date'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const isMobile = useIsMobile();

  // Memoized sorted documents
  const sortedDocuments = useMemo(() => {
    return [...filteredDocuments].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.sizeMB - b.sizeMB;
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'date':
          // Would need actual date field - using name for now
          comparison = a.name.localeCompare(b.name);
          break;
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [filteredDocuments, sortBy, sortOrder]);

  const handleFilteredDocuments = useCallback((docs: UploadedDoc[]) => {
    setFilteredDocuments(docs);
  }, []);

  const handleDocumentClick = useCallback((document: UploadedDoc) => {
    setSelectedDocument(document);
    setPreviewModalOpen(true);
    onDocumentSelect?.(document);
  }, [onDocumentSelect]);

  const handleBulkSelect = useCallback((documentId: string, selected: boolean) => {
    setBulkSelectedIds(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(documentId);
      } else {
        newSet.delete(documentId);
      }
      return newSet;
    });
  }, []);

  const handleBulkSelectAll = useCallback(() => {
    const allIds = new Set(sortedDocuments.map(doc => doc.id));
    setBulkSelectedIds(bulkSelectedIds.size === sortedDocuments.length ? new Set() : allIds);
  }, [sortedDocuments, bulkSelectedIds]);

  const handleBulkDelete = useCallback(async () => {
    if (bulkSelectedIds.size === 0) return;
    
    // Confirm deletion
    if (!window.confirm(`Delete ${bulkSelectedIds.size} document(s)? This cannot be undone.`)) {
      return;
    }
    
    // Delete each selected document
    for (const documentId of bulkSelectedIds) {
      onDocumentDelete?.(documentId);
    }
    
    setBulkSelectedIds(new Set());
  }, [bulkSelectedIds, onDocumentDelete]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'uploading':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'pdf':
        return '📄';
      case 'doc':
      case 'docx':
        return '📝';
      case 'xls':
      case 'xlsx':
        return '📊';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return '🖼️';
      case 'zip':
      case 'rar':
        return '📦';
      default:
        return '📋';
    }
  };

  const formatFileSize = (sizeMB: number): string => {
    if (sizeMB < 1) return `${(sizeMB * 1024).toFixed(0)} KB`;
    if (sizeMB < 1024) return `${sizeMB.toFixed(1)} MB`;
    return `${(sizeMB / 1024).toFixed(1)} GB`;
  };

  if (isLoading) {
    return (
      <div className={cn('space-y-6', className)}>
        <Skeleton.DocumentLibrary />
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Document Library
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {documents.length} document{documents.length !== 1 ? 's' : ''} total
            {filteredDocuments.length !== documents.length && 
              `, ${filteredDocuments.length} shown`
            }
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Upload Button */}
          <Button
            onClick={onUpload}
            leftIcon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18.75 19.5H6.75Z" />
              </svg>
            }
          >
            Upload
          </Button>

          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              )}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
              </svg>
            </button>
            
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                viewMode === 'list'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              )}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </button>
            
            <button
              onClick={() => setViewMode('analytics')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                viewMode === 'analytics'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              )}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      {viewMode !== 'analytics' && (
        <SearchFilters
          documents={documents}
          onFilteredDocuments={handleFilteredDocuments}
        />
      )}

      {/* Bulk Actions */}
      {bulkSelectedIds.size > 0 && viewMode !== 'analytics' && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {bulkSelectedIds.size} document{bulkSelectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setBulkSelectedIds(new Set())}
              >
                Clear Selection
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
                leftIcon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                }
              >
                Delete Selected
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {viewMode === 'analytics' ? (
        <AnalyticsDashboard documents={documents} />
      ) : sortedDocuments.length === 0 ? (
        <div className="text-center py-12">
          <svg className="h-16 w-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            {documents.length === 0 ? 'No documents yet' : 'No matching documents'}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {documents.length === 0
              ? 'Upload your first document to get started.'
              : 'Try adjusting your search or filter criteria.'
            }
          </p>
          {documents.length === 0 && (
            <Button onClick={onUpload}>
              Upload Document
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* List Header (for list view) */}
          {viewMode === 'list' && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={bulkSelectedIds.size === sortedDocuments.length && sortedDocuments.length > 0}
                  onChange={handleBulkSelectAll}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-600"
                />
                <div className="flex-1 grid grid-cols-4 gap-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <button
                    onClick={() => {
                      if (sortBy === 'name') {
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy('name');
                        setSortOrder('asc');
                      }
                    }}
                    className="text-left hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1"
                  >
                    Name
                    {sortBy === 'name' && (
                      <svg className={cn('h-3 w-3', sortOrder === 'desc' && 'rotate-180')} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (sortBy === 'size') {
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy('size');
                        setSortOrder('desc');
                      }
                    }}
                    className="text-left hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1"
                  >
                    Size
                    {sortBy === 'size' && (
                      <svg className={cn('h-3 w-3', sortOrder === 'desc' && 'rotate-180')} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (sortBy === 'status') {
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy('status');
                        setSortOrder('asc');
                      }
                    }}
                    className="text-left hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1"
                  >
                    Status
                    {sortBy === 'status' && (
                      <svg className={cn('h-3 w-3', sortOrder === 'desc' && 'rotate-180')} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>
                  <span>Actions</span>
                </div>
              </div>
            </div>
          )}

          {/* Documents Display */}
          {viewMode === 'grid' ? (
            <div className={cn(
              'grid gap-4',
              isMobile ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            )}>
              {sortedDocuments.map((document) => (
                <div
                  key={document.id}
                  className={cn(
                    'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow cursor-pointer',
                    bulkSelectedIds.has(document.id) && 'ring-2 ring-blue-500'
                  )}
                  onClick={() => handleDocumentClick(document)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-2xl">
                      {getFileIcon(document.name)}
                    </div>
                    <input
                      type="checkbox"
                      checked={bulkSelectedIds.has(document.id)}
                      onChange={(e) => handleBulkSelect(document.id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300"
                    />
                  </div>
                  
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2 truncate" title={document.name}>
                    {document.name}
                  </h3>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">Size:</span>
                      <span className="text-gray-900 dark:text-gray-100">{formatFileSize(document.sizeMB)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">Status:</span>
                      <span className={cn('px-2 py-1 text-xs font-medium rounded-full capitalize', getStatusColor(document.status))}>
                        {document.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {sortedDocuments.map((document) => (
                <div
                  key={document.id}
                  className={cn(
                    'flex items-center gap-4 p-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors',
                    bulkSelectedIds.has(document.id) && 'bg-blue-50 dark:bg-blue-900/20'
                  )}
                  onClick={() => handleDocumentClick(document)}
                >
                  <input
                    type="checkbox"
                    checked={bulkSelectedIds.has(document.id)}
                    onChange={(e) => handleBulkSelect(document.id, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-600"
                  />
                  
                  <div className="flex-1 grid grid-cols-4 gap-4 items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{getFileIcon(document.name)}</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate" title={document.name}>
                        {document.name}
                      </span>
                    </div>
                    
                    <span className="text-gray-600 dark:text-gray-400">
                      {formatFileSize(document.sizeMB)}
                    </span>
                    
                    <span className={cn('px-2 py-1 text-xs font-medium rounded-full capitalize w-fit', getStatusColor(document.status))}>
                      {document.status}
                    </span>
                    
                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDocumentClick(document);
                        }}
                        title="Preview"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                      </Button>
                      
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDocumentDelete?.(document.id);
                        }}
                        title="Delete"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Preview Modal */}
      <DocumentPreviewModal
        isOpen={previewModalOpen}
        onClose={() => {
          setPreviewModalOpen(false);
          setSelectedDocument(null);
        }}
        document={selectedDocument}
      />
    </div>
  );
}