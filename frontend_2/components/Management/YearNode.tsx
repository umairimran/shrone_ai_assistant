'use client';

import React, { useState } from 'react';
import { DocumentNode } from './DocumentNode';
import { YearFolder } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface YearNodeProps {
  categoryId: string;
  categoryName: string;
  yearFolder: YearFolder;
  isExpanded: boolean;
  onToggleYear: (categoryId: string, year: string) => void;
  onUploadDocument: (categoryId: string, year: string) => void;
  onDocumentSelect?: (document: any) => void;
  onDocumentDelete?: (documentId: string) => Promise<boolean>;
  onDeleteYearFolder?: (categoryId: string, year: string) => void;
  onUploadNewVersion?: (document: any) => void;
}

export function YearNode({
  categoryId,
  categoryName,
  yearFolder,
  isExpanded,
  onToggleYear,
  onUploadDocument,
  onDocumentSelect,
  onDocumentDelete,
  onDeleteYearFolder,
  onUploadNewVersion
}: YearNodeProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  
  const handleYearToggle = () => {
    onToggleYear(categoryId, yearFolder.year);
  };

  const handleUploadDocument = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUploadDocument(categoryId, yearFolder.year);
  };

  const handleDeleteFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Check if year folder has documents
    const hasDocuments = yearFolder.documentCount > 0;
    
    if (hasDocuments) {
      // Year folder is not empty - show warning
      const message = `This folder cannot be deleted because it contains ${yearFolder.documentCount} document(s).`;
      setWarningMessage(message);
      setShowDeleteWarning(true);
    } else {
      // Year folder is empty - show confirmation
      setShowDeleteConfirm(true);
    }
  };

  const confirmDeleteFolder = () => {
    if (onDeleteYearFolder) {
      onDeleteYearFolder(categoryId, yearFolder.year);
    }
    setShowDeleteConfirm(false);
  };

  return (
    <div className="select-none">
      {/* Year Header */}
      <div
        onClick={handleYearToggle}
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
          {yearFolder.documents.length > 0 && (
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

        {/* Year Folder Icon */}
        <div className="flex-shrink-0 text-base sm:text-lg">
          📂
        </div>

        {/* Year and Document Count */}
        <div className="flex-1 min-w-0 pr-1 overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-2 overflow-hidden">
            <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 flex-shrink-0">
              {yearFolder.year}
            </span>
            <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
              ({yearFolder.documentCount})
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Upload Document Button */}
          {isExpanded && (
            <button
              onClick={handleUploadDocument}
              className="px-2 py-1 text-[10px] sm:text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors whitespace-nowrap"
              title="Upload document to this year"
            >
              <span className="hidden sm:inline">+ Upload Document</span>
              <span className="sm:hidden">+ Upload</span>
            </button>
          )}
          
          {/* Delete Year Folder Button - shows on hover */}
          {onDeleteYearFolder && (isHovered || isExpanded) && (
            <button
              onClick={handleDeleteFolder}
              className="px-2 py-1 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-all duration-200 opacity-0 group-hover:opacity-100"
              title={`Delete year folder "${yearFolder.year}"`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Documents */}
      {isExpanded && (
        <div className="ml-3 sm:ml-6 mt-1 space-y-1">
          {yearFolder.documents.length > 0 ? (
            yearFolder.documents.map((document, index) => (
              <DocumentNode
                key={document.id || `${categoryId}-${yearFolder.year}-${index}`}
                document={document}
                onSelect={onDocumentSelect}
                onDelete={onDocumentDelete}
                onUploadNewVersion={onUploadNewVersion}
              />
            ))
          ) : (
            <div className="flex items-center gap-1 sm:gap-2 px-2 py-2 sm:px-3 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              <div className="w-4 h-4" /> {/* Spacer for alignment */}
              <div className="text-base sm:text-lg">📄</div>
              <span className="flex-1 min-w-0 truncate">
                <span className="hidden sm:inline">No documents in {yearFolder.year}</span>
                <span className="sm:hidden">Empty</span>
              </span>
              <button
                onClick={() => onUploadDocument(categoryId, yearFolder.year)}
                className="ml-auto px-2 py-1 text-[10px] sm:text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors whitespace-nowrap"
              >
                <span className="hidden sm:inline">Upload Document</span>
                <span className="sm:hidden">Upload</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog (Empty Year Folder) */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDeleteFolder}
        title="Delete Year Folder"
        message={`Are you sure you want to delete the year folder "${yearFolder.year}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Delete Warning Dialog (Non-empty Year Folder) */}
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