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
  onDocumentDelete
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
          'flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors',
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
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {node.name}
          </span>
          {node.documentCount > 0 && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              ({node.documentCount} {node.documentCount === 1 ? 'document' : 'documents'})
            </span>
          )}
        </div>

        {/* New Year Folder Button */}
        {isExpanded && (
          <button
            onClick={handleNewYearFolder}
            className="flex-shrink-0 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors"
            title="Add new year folder"
          >
            + New Year Folder
          </button>
        )}
      </div>

      {/* Year Folders */}
      {isExpanded && (
        <div className="ml-6 mt-1 space-y-1">
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
              />
            ))
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              <div className="w-4 h-4" /> {/* Spacer for alignment */}
              <div className="text-lg">📂</div>
              <span>No documents yet</span>
              <button
                onClick={() => onUploadDocument(node.id)}
                className="ml-auto px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors"
              >
                Upload First Document
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}