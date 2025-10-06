'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Citation } from '@/lib/types';

interface DocumentViewerState {
  isOpen: boolean;
  documentUrl: string | null;
  documentTitle: string | null;
  currentPage: number;
  highlightedCitations: Citation[];
  returnToChat: () => void;
}

interface DocumentViewerContextValue extends DocumentViewerState {
  openDocument: (_url: string, _title: string, _initialPage?: number, _citations?: Citation[]) => void;
  closeDocument: () => void;
  setCurrentPage: (_page: number) => void;
  addHighlightedCitation: (_citation: Citation) => void;
  removeHighlightedCitation: (_citationId: string) => void;
  clearHighlightedCitations: () => void;
}

const DocumentViewerContext = createContext<DocumentViewerContextValue | undefined>(undefined);

export function DocumentViewerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [highlightedCitations, setHighlightedCitations] = useState<Citation[]>([]);

  const openDocument = (
    url: string, 
    title: string, 
    initialPage: number = 1, 
    citations: Citation[] = []
  ) => {
    setDocumentUrl(url);
    setDocumentTitle(title);
    setCurrentPage(initialPage);
    setHighlightedCitations(citations);
    setIsOpen(true);
  };

  const closeDocument = () => {
    setIsOpen(false);
    // Keep document data for potential reopening
  };

  const returnToChat = () => {
    closeDocument();
    // Scroll back to the relevant citation in the chat
    // This could be enhanced to remember the exact scroll position
  };

  const addHighlightedCitation = (citation: Citation) => {
    setHighlightedCitations((prev) => {
      const exists = prev.some((c) => c.id === citation.id);
      return exists ? prev : [...prev, citation];
    });
  };

  const removeHighlightedCitation = (citationId: string) => {
    setHighlightedCitations((prev) => prev.filter((c) => c.id !== citationId));
  };

  const clearHighlightedCitations = () => {
    setHighlightedCitations([]);
  };

  const value: DocumentViewerContextValue = {
    isOpen,
    documentUrl,
    documentTitle,
    currentPage,
    highlightedCitations,
    openDocument,
    closeDocument,
    setCurrentPage,
    addHighlightedCitation,
    removeHighlightedCitation,
    clearHighlightedCitations,
    returnToChat
  };

  return (
    <DocumentViewerContext.Provider value={value}>
      {children}
    </DocumentViewerContext.Provider>
  );
}

export function useDocumentViewer() {
  const context = useContext(DocumentViewerContext);
  if (context === undefined) {
    throw new Error('useDocumentViewer must be used within a DocumentViewerProvider');
  }
  return context;
}

// Hook for determining the appropriate document URL based on citation
export function useDocumentUrl(citation: Citation): string | null {
  // This would typically resolve to the actual document URL
  // For now, return a placeholder based on the citation
  if (citation.link) {
    return citation.link;
  }
  
  // Generate a mock document URL based on the document title
  // Check multiple possible title sources with null safety
  const documentTitle = citation.document?.title || citation.title;
  
  if (!documentTitle || typeof documentTitle !== 'string') {
    // Return a fallback URL if no title is available
    return `/api/documents/unknown-document.pdf`;
  }
  
  // In a real app, this would be resolved from your document storage
  const docId = documentTitle.toLowerCase().replace(/\s+/g, '-');
  return `/api/documents/${docId}.pdf`;
}