'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Citation } from '@/lib/types';

// Dynamically import react-pdf to avoid SSR issues
let Document: any;
let Page: any;
let pdfjs: any;

if (typeof window !== 'undefined') {
  const reactPdf = require('react-pdf'); // eslint-disable-line @typescript-eslint/no-var-requires, no-undef
  Document = reactPdf.Document;
  Page = reactPdf.Page;
  pdfjs = reactPdf.pdfjs;
  
  // Set up PDF.js worker
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

interface DocumentViewerProps {
  documentUrl: string;
  initialPage?: number;
  highlightedCitations?: Citation[];
  onClose: () => void;
  className?: string;
}

export function DocumentViewer({
  documentUrl,
  initialPage = 1,
  highlightedCitations = [],
  onClose,
  className
}: DocumentViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  };


  const goToPrevPage = useCallback(() => {
    setPageNumber((prev) => Math.max(prev - 1, 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setPageNumber((prev) => Math.min(prev + 1, numPages));
  }, [numPages]);

  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= numPages) {
      setPageNumber(page);
    }
  }, [numPages]);

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.2, 3));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.2, 0.5));
  }, []);

  const fitToWidth = useCallback(() => {
    setScale(1.2);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        goToPrevPage();
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        goToNextPage();
      } else if (event.key === '+' || event.key === '=') {
        zoomIn();
      } else if (event.key === '-') {
        zoomOut();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goToPrevPage, goToNextPage, zoomIn, zoomOut]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-white/10 px-4 py-3 backdrop-blur-md dark:bg-gray-900/90">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">Document Viewer</h2>
          {!loading && !error && (
            <span className="text-sm text-gray-300">
              Page {pageNumber} of {numPages}
            </span>
          )}
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={goToPrevPage}
            disabled={pageNumber <= 1 || loading}
            className="text-white hover:bg-white/20"
            title="Previous page (← or ↑)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={goToNextPage}
            disabled={pageNumber >= numPages || loading}
            className="text-white hover:bg-white/20"
            title="Next page (→ or ↓)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Button>
          
          <div className="h-6 w-px bg-white/20" />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="text-white hover:bg-white/20"
            title="Zoom out (-)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
            </svg>
          </Button>
          
          <span className="text-sm text-gray-300 min-w-16 text-center">
            {Math.round(scale * 100)}%
          </span>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomIn}
            disabled={scale >= 3}
            className="text-white hover:bg-white/20"
            title="Zoom in (+)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
            </svg>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={fitToWidth}
            className="text-white hover:bg-white/20"
            title="Fit to width"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </Button>
          
          <div className="h-6 w-px bg-white/20" />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-white hover:bg-white/20"
            title="Close (Esc)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Page Navigation Sidebar */}
        <div className="w-64 bg-black/50 p-4 overflow-y-auto hidden lg:block">
          <h3 className="text-sm font-semibold text-white mb-3">Pages</h3>
          <div className="space-y-1">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => goToPage(page)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm rounded-md transition-colors',
                  page === pageNumber
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                )}
              >
                Page {page}
              </button>
            ))}
          </div>
        </div>

        {/* Document Content */}
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-800">
          <div className="flex justify-center p-6">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-current border-t-transparent" />
                  Loading document...
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="text-red-600 dark:text-red-400 mb-2">
                    <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">{error}</p>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                    The document could not be loaded. Please try again.
                  </p>
                </div>
              </div>
            )}

            {!loading && !error && Document && Page && (
              <div className="relative">
                <Document
                  file={documentUrl}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={(error: Error) => {
                    setError(`Failed to load document: ${error.message}`);
                    setLoading(false);
                  }}
                  loading={null}
                  error={null}
                >
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    className="shadow-lg"
                  />
                </Document>
                
                {/* Citation Highlights Overlay */}
                {highlightedCitations.length > 0 && (
                  <CitationHighlights
                    citations={highlightedCitations}
                    pageNumber={pageNumber}
                    scale={scale}
                  />
                )}
              </div>
            )}
            
            {!loading && !error && (!Document || !Page) && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="text-gray-600 dark:text-gray-400 mb-2">
                    <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-4.5A3.375 3.375 0 008.25 8.25v2.625a3.375 3.375 0 003.375 3.375h5.25a3.375 3.375 0 003.375-3.375z" />
                    </svg>
                  </div>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">PDF Viewer Loading...</p>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                    PDF viewer components are being loaded.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Component for rendering citation highlights
interface CitationHighlightsProps {
  citations: Citation[];
  pageNumber: number;
  scale: number;
}

function CitationHighlights({ citations, pageNumber, scale: _scale }: CitationHighlightsProps) {
  const pageCitations = citations.filter((citation) => {
    if (!citation.page_span) return false;
    return pageNumber >= citation.page_span.start && pageNumber <= citation.page_span.end;
  });

  if (pageCitations.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {pageCitations.map((citation, index) => (
        <div
          key={citation.id || index}
          className="absolute bg-yellow-400/30 border-2 border-yellow-500 rounded-sm"
          style={{
            // These would be calculated based on the citation's position
            // For now, using placeholder positions
            top: `${20 + index * 10}%`,
            left: '10%',
            width: '80%',
            height: '5%',
          }}
          title={`Citation: ${citation.doc_title}`}
        />
      ))}
    </div>
  );
}