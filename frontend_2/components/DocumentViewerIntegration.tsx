'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useDocumentViewer } from '@/context/DocumentViewerContext';
import { DocumentViewer } from './DocumentViewer/DocumentViewer';

// Wrap DocumentViewer with client-side only rendering
const LazyDocumentViewer = dynamic(
  () => Promise.resolve({ default: DocumentViewer }),
  { 
    ssr: false,
    loading: () => <DocumentViewerLoader />
  }
);

export function DocumentViewerIntegration() {
  const { 
    isOpen, 
    documentUrl, 
    currentPage, 
    highlightedCitations, 
    closeDocument
  } = useDocumentViewer();

  if (!isOpen || !documentUrl) {
    return null;
  }

  return (
    <Suspense fallback={<DocumentViewerLoader />}>
      <LazyDocumentViewer
        documentUrl={documentUrl}
        initialPage={currentPage}
        highlightedCitations={highlightedCitations}
        onClose={closeDocument}
      />
    </Suspense>
  );
}

// Loading component for document viewer
function DocumentViewerLoader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="flex items-center gap-3 text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
        <span className="text-lg font-medium">Loading Document Viewer...</span>
      </div>
    </div>
  );
}