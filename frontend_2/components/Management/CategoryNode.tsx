'use client';

import React, { useState } from 'react';
import { YearNode } from './YearNode';
import { CategoryTreeNode } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface CategoryNodeProps {
  node: CategoryTreeNode;
  isExpanded: boolean;
  yearExpandedState: { [year: string]: boolean };
  onToggleCategory: (categoryId: string) => void;
  onToggleYear: (categoryId: string, year: string) => void;
  onNewYearFolder: (categoryId: string) => void;
  onUploadDocument: (categoryId: string, year?: string) => void;
  onDocumentSelect?: (document: any) => void;
  onDocumentDelete?: (documentId: string) => Promise<boolean>;
  onDeleteYearFolder?: (categoryId: string, year: string) => void;
  onUploadNewVersion?: (document: any) => void;
  onDeleteCategory?: (categoryId: string) => void;
}

export function CategoryNode({
  node,
  isExpanded,
  yearExpandedState,
  onToggleCategory,
  onToggleYear,
  onNewYearFolder,
  onUploadDocument,
  onDocumentSelect,
  onDocumentDelete,
  onDeleteYearFolder,
  onUploadNewVersion,
  onDeleteCategory
}: CategoryNodeProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');

  const handleCategoryToggle = () => {
    onToggleCategory(node.id);
  };

  const handleNewYearFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNewYearFolder(node.id);
  };

  const handleDeleteCategory = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Check if category is empty (no year folders and no documents)
    const hasYearFolders = node.yearFolders && node.yearFolders.length > 0;
    const hasDocuments = node.documentCount > 0;
    
    if (hasYearFolders || hasDocuments) {
      // Category is not empty - show warning
      let message = "This category cannot be deleted because it contains ";
      if (hasYearFolders && hasDocuments) {
        message += `${node.yearFolders.length} folder(s) and ${node.documentCount} document(s).`;
      } else if (hasYearFolders) {
        message += `${node.yearFolders.length} folder(s).`;
      } else {
        message += `${node.documentCount} document(s).`;
      }
      
      setWarningMessage(message);
      setShowDeleteWarning(true);
    } else {
      // Category is empty - show confirmation
      setShowDeleteConfirm(true);
    }
  };

  const confirmDelete = async () => {
    if (!onDeleteCategory) return;
    
    setIsDeleting(true);
    try {
      await onDeleteCategory(node.id);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete category:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="select-none">
      {/* Category Header */}
      <div
        onClick={handleCategoryToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          'flex items-center gap-1 sm:gap-2 px-2 py-2 sm:px-3 rounded-md cursor-pointer transition-colors overflow-hidden group',
          'hover:bg-gray-100 dark:hover:bg-gray-800',
          isExpanded && 'bg-gray-50 dark:bg-gray-800/50'
        )}
      >
        {/* Expand/Collapse Arrow */}
        <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
          {node.yearFolders.length > 0 && (
            <svg
              className={cn(
                'w-3 h-3 text-gray-500 transition-transform duration-150',
                isExpanded && 'transform rotate-90'
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>

        {/* Category Icon */}
        <div className="flex-shrink-0 text-lg">
          📁
        </div>

        {/* Category Name and Count */}
        <div className="flex-1 min-w-0 pr-1 overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-2 overflow-hidden">
            <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1 block">
              {node.name}
            </span>
            {node.documentCount > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
                ({node.documentCount})
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* New Year Folder Button */}
          {isExpanded && (
            <button
              onClick={handleNewYearFolder}
              className="px-2 py-1 text-[10px] sm:text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors whitespace-nowrap"
              title="Add new year folder"
            >
              <span className="hidden sm:inline">+ New Year Folder</span>
              <span className="sm:hidden">+ Year</span>
            </button>
          )}

          {/* Delete Category Button */}
          {onDeleteCategory && (isHovered || showDeleteConfirm) && (
            <button
              onClick={handleDeleteCategory}
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-all duration-200"
              title={`Delete category "${node.name}"`}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Year Folders */}
      {isExpanded && (
        <div className="ml-3 sm:ml-6 mt-1 space-y-1">
          {node.yearFolders.length > 0 ? (
            node.yearFolders.map(yearFolder => (
              <YearNode
                key={yearFolder.year}
                categoryId={node.id}
                categoryName={node.name}
                yearFolder={yearFolder}
                isExpanded={yearExpandedState[yearFolder.year] || false}
                onToggleYear={onToggleYear}
                onUploadDocument={onUploadDocument}
                onDocumentSelect={onDocumentSelect}
                onDocumentDelete={onDocumentDelete}
                onDeleteYearFolder={onDeleteYearFolder}
                onUploadNewVersion={onUploadNewVersion}
              />
            ))
          ) : (
            <div className="flex items-center gap-1 sm:gap-2 px-2 py-2 sm:px-3 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              <div className="w-4 h-4" /> {/* Spacer for alignment */}
              <div className="text-base sm:text-lg">📂</div>
              <span className="flex-1 min-w-0">No year folders yet. Create a year folder to upload documents.</span>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog (Empty Category) */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Delete Category"
        message={`Are you sure you want to delete the category "${node.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={isDeleting}
      />

      {/* Delete Warning Dialog (Non-empty Category) */}
      <ConfirmDialog
        isOpen={showDeleteWarning}
        onClose={() => setShowDeleteWarning(false)}
        onConfirm={() => setShowDeleteWarning(false)}
        title="Cannot Delete"
        message={warningMessage}
        confirmText="OK"
        cancelText=""
        variant="warning"
      />
    </div>
  );
}