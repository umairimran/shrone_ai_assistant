'use client';

import React from 'react';
import { DocumentNode } from './DocumentNode';
import { YearFolder } from '@/lib/types';
import { cn } from '@/lib/utils';

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
  const handleYearToggle = () => {
    onToggleYear(categoryId, yearFolder.year);
  };

  const handleUploadDocument = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUploadDocument(categoryId, yearFolder.year);
  };

  const handleDeleteFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (yearFolder.documentCount === 0 && onDeleteYearFolder) {
      onDeleteYearFolder(categoryId, yearFolder.year);
    }
  };

  return (
    <div className="select-none">
      {/* Year Header */}
      <div
        onClick={handleYearToggle}
        className={cn(
          'flex items-center gap-1 sm:gap-2 px-2 py-2 sm:px-3 rounded-md cursor-pointer transition-colors overflow-hidden',
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
        {isExpanded && (
          <div className="flex items-center gap-1">
            {/* Upload Document Button */}
            <button
              onClick={handleUploadDocument}
              className="flex-shrink-0 px-2 py-1 text-[10px] sm:text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors whitespace-nowrap"
              title="Upload document to this year"
            >
              <span className="hidden sm:inline">+ Upload Document</span>
              <span className="sm:hidden">+ Upload</span>
            </button>
            
            {/* Delete Empty Folder Button */}
            {yearFolder.documentCount === 0 && onDeleteYearFolder && (
              <button
                onClick={handleDeleteFolder}
                className="flex-shrink-0 px-2 py-1 text-[10px] sm:text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors whitespace-nowrap"
                title="Delete empty year folder"
              >
                🗑️
              </button>
            )}
          </div>
        )}
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
    </div>
  );
}