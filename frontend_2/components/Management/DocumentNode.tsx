'use client';

import React, { useState } from 'react';
import { UploadedDoc } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface DocumentNodeProps {
  document: UploadedDoc;
  onSelect?: (document: UploadedDoc) => void;
  onDelete?: (documentId: string) => Promise<boolean>;
  onUploadNewVersion?: (document: UploadedDoc) => void;
}

export function DocumentNode({
  document,
  onSelect,
  onDelete,
  onUploadNewVersion
}: DocumentNodeProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDocumentClick = () => {
    if (onSelect) {
      onSelect(document);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    
    setIsDeleting(true);
    try {
      const success = await onDelete(document.id);
      if (success) {
        setShowDeleteConfirm(false);
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const getDocumentIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'pdf':
        return '📄';
      case 'doc':
      case 'docx':
      case 'word':
        return '📝';
      case 'txt':
        return '📃';
      case 'xls':
      case 'xlsx':
      case 'excel':
        return '📊';
      case 'ppt':
      case 'pptx':
        return '📋';
      default:
        return '📄';
    }
  };

  return (
    <>
      <div className="flex items-center gap-1 sm:gap-2 px-2 py-2 sm:px-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group overflow-hidden">
        {/* Spacer for tree alignment */}
        <div className="w-4 h-4" />
        
        {/* Document Icon */}
        <div className="flex-shrink-0 text-base sm:text-lg">
          {getDocumentIcon(document.type)}
        </div>
        
        {/* Document Name */}
        <div 
          className="flex-1 min-w-0 cursor-pointer overflow-hidden"
          onClick={handleDocumentClick}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors block flex-1">
              {document.title || document.name}
            </span>
            {document.version && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded whitespace-nowrap flex-shrink-0">
                v{document.version}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex-shrink-0 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {onUploadNewVersion && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUploadNewVersion(document);
              }}
              className="px-2 py-1 text-[10px] sm:text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors whitespace-nowrap"
              title="Upload new version"
            >
              + Version
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
              }}
              className="p-1.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"
              title="Delete"
              disabled={isDeleting}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Document"
        message={`Are you sure you want to delete "${document.title || document.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
}