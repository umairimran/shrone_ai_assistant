'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { DocumentCategory } from '@/lib/types';

interface CategoryCardProps {
  category: DocumentCategory;
  isSelected?: boolean;
  onSelect: (_categoryId: string) => void;
  onUpload: (_categoryId: string) => void;
  onViewDocuments?: (_categoryId: string) => void;
  className?: string;
}

export function CategoryCard({ 
  category, 
  isSelected = false, 
  onSelect, 
  onUpload, 
  onViewDocuments,
  className 
}: CategoryCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-lg border-2 bg-white dark:bg-zinc-900 p-6 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer',
        isSelected 
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 ring-2 ring-blue-500/20' 
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
        className
      )}
      onClick={() => onSelect(category.id)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {category.name}
          </h3>
          {category.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
              {category.description}
            </p>
          )}
          <div className="flex items-center gap-4">
            <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-medium">{category.documentCount}</span>
              <span className="ml-1">
                {category.documentCount === 1 ? 'document' : 'documents'}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-4 flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(category.id);
          }}
          className={cn(
            'flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors',
            isSelected
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          )}
        >
          {isSelected ? 'Selected' : 'Manage'}
        </button>
        {onViewDocuments && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDocuments(category.id);
            }}
            className="px-3 py-2 text-sm font-medium text-green-600 bg-green-50 hover:bg-green-100 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-900 rounded-md transition-colors"
          >
            <svg className="w-4 h-4 mr-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUpload(category.id);
          }}
          className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:hover:bg-blue-900 rounded-md transition-colors"
        >
          <svg className="w-4 h-4 mr-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Upload
        </button>
      </div>
    </div>
  );
}