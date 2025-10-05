'use client';

import React, { useState, useEffect, useRef } from 'react';
import { UploadedDoc } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: UploadedDoc | null;
  className?: string;
}

interface PreviewState {
  isLoading: boolean;
  error: string | null;
  previewUrl: string | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  rotation: number;
}

export function DocumentPreviewModal({
  isOpen,
  onClose,
  document,
  className
}: DocumentPreviewModalProps) {
  const [previewState, setPreviewState] = useState<PreviewState>({
    isLoading: false,
    error: null,
    previewUrl: null,
    currentPage: 1,
    totalPages: 1,
    zoom: 100,
    rotation: 0
  });

  const modalRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen && typeof window !== 'undefined') {
      window.document.addEventListener('keydown', handleEscape);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.document.removeEventListener('keydown', handleEscape);
      }
    };
  }, [isOpen, onClose]);

  // Load preview when document changes
  useEffect(() => {
    if (!document || !isOpen) {
      setPreviewState(prev => ({ ...prev, previewUrl: null, error: null }));
      return;
    }

    loadPreview(document);
  }, [document, isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen && typeof window !== 'undefined') {
      window.document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.document.removeEventListener('mousedown', handleClickOutside);
      }
    };
  }, [isOpen, onClose]);

  const loadPreview = async (doc: UploadedDoc) => {
    setPreviewState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // In a real app, this would make an API call to generate/get preview
      // For now, we'll simulate different preview types based on file extension
      const extension = doc.name.split('.').pop()?.toLowerCase();
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      let previewUrl: string | null = null;
      let totalPages = 1;

      switch (extension) {
        case 'pdf':
          // For PDF, we'd use a PDF viewer service or embed
          previewUrl = `/api/documents/${doc.id}/preview?type=pdf`;
          totalPages = Math.floor(Math.random() * 10) + 1; // Simulated page count
          break;
        
        case 'doc':
        case 'docx':
          // For Word documents, convert to HTML or use Google Docs Viewer
          previewUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(`/api/documents/${doc.id}/download`)}&embedded=true`;
          break;
        
        case 'txt':
        case 'md':
          // For text files, show content directly
          previewUrl = `/api/documents/${doc.id}/preview?type=text`;
          break;
        
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
          // For images, show directly
          previewUrl = `/api/documents/${doc.id}/download`;
          break;
        
        default:
          throw new Error(`Preview not supported for ${extension} files`);
      }

      setPreviewState(prev => ({
        ...prev,
        isLoading: false,
        previewUrl,
        totalPages,
        currentPage: 1,
        zoom: 100,
        rotation: 0
      }));
    } catch (error) {
      setPreviewState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load preview'
      }));
    }
  };

  const handleZoom = (direction: 'in' | 'out' | 'reset') => {
    setPreviewState(prev => {
      let newZoom = prev.zoom;
      
      switch (direction) {
        case 'in':
          newZoom = Math.min(prev.zoom + 25, 300);
          break;
        case 'out':
          newZoom = Math.max(prev.zoom - 25, 25);
          break;
        case 'reset':
          newZoom = 100;
          break;
      }
      
      return { ...prev, zoom: newZoom };
    });
  };

  const handleRotate = () => {
    setPreviewState(prev => ({
      ...prev,
      rotation: (prev.rotation + 90) % 360
    }));
  };

  const handlePageChange = (direction: 'prev' | 'next' | number) => {
    setPreviewState(prev => {
      let newPage = prev.currentPage;
      
      if (typeof direction === 'number') {
        newPage = Math.max(1, Math.min(direction, prev.totalPages));
      } else if (direction === 'prev') {
        newPage = Math.max(1, prev.currentPage - 1);
      } else {
        newPage = Math.min(prev.totalPages, prev.currentPage + 1);
      }
      
      return { ...prev, currentPage: newPage };
    });
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'pdf':
        return (
          <svg className="h-6 w-6 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
          </svg>
        );
      case 'doc':
      case 'docx':
        return (
          <svg className="h-6 w-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
        );
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return (
          <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
        );
      default:
        return (
          <svg className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className={cn(
      'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm',
      className
    )}>
      <div
        ref={modalRef}
        className="relative w-full h-full max-w-7xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-lg shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            {document && getFileIcon(document.name)}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {document?.name}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {document?.sizeMB.toFixed(2)} MB
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Download Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // In a real app, this would trigger download
                window.open(`/api/documents/${document?.id}/download`, '_blank');
              }}
              leftIcon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              }
            >
              Download
            </Button>
            
            {/* Close Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              leftIcon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              }
            >
              Close
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            {/* Zoom Controls */}
            <div className="flex items-center space-x-1 bg-white dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleZoom('out')}
                disabled={previewState.zoom <= 25}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                </svg>
              </Button>
              
              <span className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 min-w-[50px] text-center">
                {previewState.zoom}%
              </span>
              
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleZoom('in')}
                disabled={previewState.zoom >= 300}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
                </svg>
              </Button>
            </div>

            {/* Reset Zoom */}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => handleZoom('reset')}
              disabled={previewState.zoom === 100}
            >
              Reset
            </Button>

            {/* Rotate */}
            <Button
              variant="ghost"
              size="xs"
              onClick={handleRotate}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </Button>
          </div>

          {/* Page Navigation (for multi-page documents) */}
          {previewState.totalPages > 1 && (
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handlePageChange('prev')}
                disabled={previewState.currentPage <= 1}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Button>
              
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Page {previewState.currentPage} of {previewState.totalPages}
              </span>
              
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handlePageChange('next')}
                disabled={previewState.currentPage >= previewState.totalPages}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-800">
          {previewState.isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-600 dark:text-gray-400">Loading preview...</p>
              </div>
            </div>
          ) : previewState.error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4 max-w-md">
                <svg className="h-16 w-16 text-gray-400 mx-auto" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <div>
                  <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                    Preview Unavailable
                  </h4>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    {previewState.error}
                  </p>
                  <Button
                    onClick={() => document && loadPreview(document)}
                    leftIcon={
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                    }
                  >
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          ) : previewState.previewUrl ? (
            <div 
              className="w-full h-full overflow-auto flex justify-center items-center p-4"
              style={{
                transform: `scale(${previewState.zoom / 100}) rotate(${previewState.rotation}deg)`,
                transformOrigin: 'center'
              }}
            >
              {document && (document.name.toLowerCase().endsWith('.jpg') || 
                          document.name.toLowerCase().endsWith('.jpeg') || 
                          document.name.toLowerCase().endsWith('.png') || 
                          document.name.toLowerCase().endsWith('.gif')) ? (
                <img 
                  src={previewState.previewUrl} 
                  alt={document.name}
                  className="max-w-full max-h-full object-contain"
                  onError={() => {
                    setPreviewState(prev => ({ 
                      ...prev, 
                      error: 'Failed to load image' 
                    }));
                  }}
                />
              ) : (
                <iframe
                  ref={previewRef}
                  src={previewState.previewUrl}
                  className="w-full h-full border-0 bg-white"
                  title={`Preview of ${document?.name}`}
                  onError={() => {
                    setPreviewState(prev => ({ 
                      ...prev, 
                      error: 'Failed to load document preview' 
                    }));
                  }}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}