'use client';

import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

interface AnswerContentProps {
  html: string;
  onCitationClick?: (citationId: string) => void;
  className?: string;
}

// Configure DOMPurify for safe HTML rendering
const purifyConfig = {
  ALLOWED_TAGS: [
    'p', 'div', 'span', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'a', 'code', 'pre', 'sup', 'sub'
  ],
  ALLOWED_ATTR: ['class', 'data-cite', 'href', 'target', 'rel', 'id'],
  ALLOW_DATA_ATTR: true,
  ADD_TAGS: ['citation-marker'],
  ADD_ATTR: ['data-cite', 'data-citation-id']
};

export function AnswerContent({ html, onCitationClick, className }: AnswerContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contentRef.current || !onCitationClick) return;

  const handleCitationClick = (event: Event) => {
      const target = event.target as HTMLElement;
      
      // Check if clicked element or its parent has citation data
      const citationElement = target.closest('[data-cite]') || target.closest('.citation-marker');
      
      if (citationElement) {
        event.preventDefault();
        const citationId = citationElement.getAttribute('data-cite') || 
                          citationElement.getAttribute('data-citation-id');
        
        if (citationId) {
          onCitationClick(citationId);
        }
      }
    };

    const container = contentRef.current;
    container.addEventListener('click', handleCitationClick);

    return () => {
      container.removeEventListener('click', handleCitationClick);
    };
  }, [onCitationClick]);

  // Process HTML to enhance citation markers
  const processedHtml = React.useMemo(() => {
    // First sanitize the HTML
    const sanitized = DOMPurify.sanitize(html, purifyConfig);
    
    // Enhance citation markers [1], [2], etc.
    return sanitized.replace(
      /\[(\d+)\]/g,
      `<button class="citation-marker inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-blue-600 bg-blue-100 rounded-full hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors cursor-pointer dark:text-blue-400 dark:bg-blue-900/30 dark:hover:bg-blue-800/40" data-citation-id="$1" aria-label="Citation $1" title="Click to view citation $1">$1</button>`
    );
  }, [html]);

  return (
    <div
      ref={contentRef}
      className={cn(
        'prose prose-sm max-w-none',
        'prose-headings:text-gray-900 dark:prose-headings:text-gray-100',
        'prose-p:text-gray-700 dark:prose-p:text-gray-300',
        'prose-p:leading-7',
        'prose-a:text-blue-600 dark:prose-a:text-blue-400',
        'prose-strong:text-gray-900 dark:prose-strong:text-gray-100',
        'prose-code:text-gray-900 dark:prose-code:text-gray-100',
        'prose-code:bg-gray-100 dark:prose-code:bg-gray-800',
        'prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800',
        'prose-blockquote:border-blue-500 dark:prose-blockquote:border-blue-400',
        className
      )}
      dangerouslySetInnerHTML={{ __html: processedHtml }}
    />
  );
}

// Hook for citation interactions
export function useCitationInteractions() {
  const scrollToCitation = (citationId: string) => {
    const element = document.getElementById(`citation-${citationId}`);
    if (element) {
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
      
      // Add temporary highlight effect
      element.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
      }, 2000);
    }
  };

  const highlightCitation = (citationId: string, duration = 2000) => {
    const element = document.getElementById(`citation-${citationId}`);
    if (element) {
      element.classList.add('bg-blue-100', 'dark:bg-blue-900/30');
      setTimeout(() => {
        element.classList.remove('bg-blue-100', 'dark:bg-blue-900/30');
      }, duration);
    }
  };

  const copyCitationToClipboard = async (citationText: string) => {
    try {
      await navigator.clipboard.writeText(citationText);
      return true;
    } catch (error) {
      console.error('Failed to copy citation:', error);
      return false;
    }
  };

  return {
    scrollToCitation,
    highlightCitation,
    copyCitationToClipboard
  };
}

// Enhanced processing status component
export function ProcessingStatusIndicator({ 
  status,
  details 
}: { 
  status: 'complete' | 'partial' | 'processing' | 'documents_processing' | 'citations_extracting' | 'validation_pending';
  details?: string;
}) {
  if (status === 'complete') return null;

  const statusConfig = {
    processing: {
      bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      icon: (
        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
        </svg>
      ),
      message: 'Processing response...'
    },
    documents_processing: {
      bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      icon: (
        <svg className="animate-pulse h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-4.5A3.375 3.375 0 008.25 8.25v2.625m11.25-2.625a3.375 3.375 0 003.375 3.375H8.25m11.25-4.5H3.375a1.125 1.125 0 00-1.125 1.125v9.75a1.125 1.125 0 001.125 1.125h17.25a1.125 1.125 0 001.125-1.125v-9.75a1.125 1.125 0 00-1.125-1.125z" />
        </svg>
      ),
      message: 'Processing documents...'
    },
    citations_extracting: {
      bg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
      icon: (
        <svg className="animate-bounce h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      ),
      message: 'Extracting citations...'
    },
    validation_pending: {
      bg: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
      icon: (
        <svg className="animate-pulse h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
        </svg>
      ),
      message: 'Validating sources...'
    },
    partial: {
      bg: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      icon: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      ),
      message: 'Citations may be incomplete'
    }
  };

  const config = statusConfig[status];
  if (!config) return null;

  return (
    <div className={cn(
      'inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium',
      config.bg
    )}>
      {config.icon}
      <span>{details || config.message}</span>
    </div>
  );
}
