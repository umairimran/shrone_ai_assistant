'use client';

import React from 'react';
import { YearNode } from './YearNode';
import { CategoryTreeNode } from '@/lib/types';
import { cn } from '@/lib/utils';

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
  onUploadNewVersion
}: CategoryNodeProps) {
  const handleCategoryToggle = () => {
    onToggleCategory(node.id);
  };

  const handleNewYearFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNewYearFolder(node.id);
  };

  return (
    <div className="select-none">
      {/* Category Header */}
      <div
        onClick={handleCategoryToggle}
        className={cn(
          'flex items-center gap-1 sm:gap-2 px-2 py-2 sm:px-3 rounded-md cursor-pointer transition-colors overflow-hidden',
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

        {/* New Year Folder Button */}
        {isExpanded && (
          <button
            onClick={handleNewYearFolder}
            className="flex-shrink-0 px-2 py-1 text-[10px] sm:text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors whitespace-nowrap"
            title="Add new year folder"
          >
            <span className="hidden sm:inline">+ New Year Folder</span>
            <span className="sm:hidden">+ Year</span>
          </button>
        )}
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
    </div>
  );
}