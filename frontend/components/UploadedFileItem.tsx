'use client';

import React from 'react';
import { UploadedDoc } from '@/lib/types';
import { cn, formatFileSize } from '@/lib/utils';

interface UploadedFileItemProps {
  doc: UploadedDoc;
  onDelete: (id: string) => void;
  onSelect?: (id: string) => void;
  isActive?: boolean;
}

export function UploadedFileItem({ doc, onDelete, onSelect, isActive }: UploadedFileItemProps) {
  const handleSelect = () => {
    if (!onSelect) return;
    onSelect(doc.id);
  };

  const handleDeleteClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onDelete(doc.id);
  };

  return (
    <div
      className={cn(
        'group rounded-lg border p-3 transition-all duration-200',
        'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
        onSelect && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-750 hover:border-blue-500 dark:hover:border-blue-500',
        isActive && 'bg-blue-50 dark:bg-blue-950 border-blue-500 shadow-sm'
      )}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? isActive : undefined}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (!onSelect) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSelect();
        }
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={doc.name}>
            {doc.name}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatFileSize(doc.sizeMB)}</p>
        </div>
        <button
          type="button"
          className="flex-shrink-0 h-6 w-6 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors flex items-center justify-center"
          aria-label={`Delete ${doc.name}`}
          onClick={handleDeleteClick}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {doc.status !== 'uploaded' && (
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span className="capitalize">{doc.status}</span>
          {doc.status === 'uploading' && <span>{Math.round(doc.progress ?? 0)}%</span>}
        </div>
      )}
      {doc.status === 'uploading' && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={cn('h-full rounded-full bg-blue-500 transition-all duration-200')}
            style={{ width: `${Math.min(100, doc.progress ?? 0)}%` }}
          />
        </div>
      )}
      {doc.status === 'failed' && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-400">Upload failed. Try again.</p>
      )}
    </div>
  );
}
