'use client';

import React, { useState } from 'react';
import { Citation } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useCitationInteractions } from '@/components/AnswerContent';
import { useDocumentViewer, useDocumentUrl } from '@/context/DocumentViewerContext';
import { trackCitationCopy, trackDocumentView, trackMissingSourceLink } from '@/services/TelemetryService';

interface CitationCardProps {
  citation: Citation;
  index: number;
  isHighlighted?: boolean;
  onViewDocument?: (citation: Citation) => void;
  className?: string;
}

export function CitationCard({ 
  citation, 
  index, 
  isHighlighted = false, 
  onViewDocument, 
  className 
}: CitationCardProps) {
  const [copied, setCopied] = useState(false);
  const { copyCitationToClipboard } = useCitationInteractions();
  const { openDocument } = useDocumentViewer();
  const documentUrl = useDocumentUrl(citation);

  const handleCopy = async () => {
    const citationText = formatCitationText(citation, index);
    const success = await copyCitationToClipboard(citationText);
    
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      // Track citation copy event
      trackCitationCopy(
        citation.id || `${index + 1}`,
        index,
        citation.doc_title
      );
    }
  };

  const handleViewDocument = () => {
    if (onViewDocument) {
      onViewDocument(citation);
    } else if (documentUrl) {
      // Open in document viewer
      const initialPage = citation.page_span?.start || 1;
      openDocument(documentUrl, citation.doc_title, initialPage, [citation]);
      
      // Track document view event
      trackDocumentView(
        citation.id || `${index + 1}`,
        index,
        citation.doc_title,
        initialPage
      );
    }
  };

  const isDocumentAvailable = citation.link || citation.page_span || documentUrl;

  // Track missing source links for quality monitoring
  React.useEffect(() => {
    if (!isDocumentAvailable) {
      trackMissingSourceLink(
        citation.id || `${index + 1}`,
        index,
        citation.doc_title
      );
    }
  }, [citation.id, citation.doc_title, index, isDocumentAvailable]);

  return (
    <div
      id={`citation-${index + 1}`}
      className={cn(
        'group relative rounded-lg border p-4 transition-all duration-200',
        'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
        'hover:border-blue-500 hover:shadow-sm',
        isHighlighted && 'border-blue-500 shadow-sm',
        className
      )}
    >
      <div className="p-4">
        {/* Citation Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <span 
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                'bg-blue-500 text-white'
              )}
              aria-label={`Citation ${index + 1}`}
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                {citation.doc_title}
              </h4>
              {citation.hierarchy_path && (
                <Tooltip 
                  content={
                    <div className="max-w-xs">
                      <div className="font-semibold mb-1">Document Structure:</div>
                      <div className="text-xs opacity-90">{citation.hierarchy_path}</div>
                      {citation.section && (
                        <div className="text-xs opacity-75 mt-1">Section: {citation.section}</div>
                      )}
                    </div>
                  }
                  position="top"
                >
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 cursor-help hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                    {citation.hierarchy_path.length > 50 
                      ? `${citation.hierarchy_path.slice(0, 50)}...` 
                      : citation.hierarchy_path}
                  </p>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Confidence Score */}
          {citation.confidence_score !== undefined && (
            <Tooltip
              content={
                <div className="text-center">
                  <div className="font-semibold">Relevance Score</div>
                  <div className="text-xs opacity-90 mt-1">
                    {Math.round(citation.confidence_score * 100)}% confidence
                  </div>
                  <div className="text-xs opacity-75 mt-1">
                    {citation.confidence_score >= 0.8 ? 'High relevance' :
                     citation.confidence_score >= 0.6 ? 'Medium relevance' :
                     'Lower relevance'}
                  </div>
                </div>
              }
              position="left"
            >
              <div className="flex items-center gap-1 cursor-help">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {Math.round(citation.confidence_score * 100)}%
                </span>
                <div className="w-12 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${citation.confidence_score * 100}%` }}
                  />
                </div>
              </div>
            </Tooltip>
          )}
        </div>

        {/* Citation Metadata */}
        <div className="flex flex-wrap gap-2 mb-3">
          {citation.pages && (
            <Tooltip
              content={`Referenced on page(s): ${citation.pages}`}
              position="top"
            >
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/30 text-xs font-medium text-blue-700 dark:text-blue-300 cursor-help">
                {citation.pages.toLowerCase().startsWith('p.') ? citation.pages : `p. ${citation.pages}`}
              </span>
            </Tooltip>
          )}
          {citation.page_span && (
            <Tooltip
              content={
                <div>
                  <div className="font-semibold">Page Range</div>
                  <div className="text-xs opacity-90 mt-1">
                    Spans {citation.page_span.end - citation.page_span.start + 1} page{citation.page_span.end - citation.page_span.start > 0 ? 's' : ''}
                  </div>
                  <div className="text-xs opacity-75 mt-1">
                    From page {citation.page_span.start} to {citation.page_span.end}
                  </div>
                </div>
              }
              position="top"
            >
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 cursor-help">
                Pages {citation.page_span.start}-{citation.page_span.end}
              </span>
            </Tooltip>
          )}
        </div>

        {/* Quote */}
        {citation.quote && (
          <blockquote className="border-l-3 border-blue-500 pl-3 py-1 mb-3 bg-gray-50 dark:bg-gray-700/50 rounded-r">
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed italic">
              "{citation.quote}"
            </p>
          </blockquote>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* View Document Button */}
            {isDocumentAvailable ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleViewDocument}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                leftIcon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-4.5B4.875 8.25 2.25 10.875 2.25 14.25v2.625a3.375 3.375 0 003.375 3.375h5.25a3.375 3.375 0 003.375-3.375z" />
                  </svg>
                }
              >
                View in document
              </Button>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Source link unavailable
              </span>
            )}
          </div>

          {/* Copy Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className={cn(
              'transition-colors',
              copied 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            )}
            leftIcon={
              copied ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              )
            }
            title={copied ? 'Copied!' : 'Copy citation'}
          >
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Format citation text for copying
function formatCitationText(citation: Citation, index: number): string {
  const parts = [`[${index + 1}]`, citation.doc_title];
  
  if (citation.hierarchy_path) {
    parts.push(citation.hierarchy_path);
  }
  
  if (citation.pages) {
    const formattedPages = citation.pages.toLowerCase().startsWith('p.') 
      ? citation.pages 
      : `p. ${citation.pages}`;
    parts.push(formattedPages);
  }
  
  if (citation.quote) {
    parts.push(`"${citation.quote}"`);
  }
  
  return parts.join(' • ');
}

// Citations List Container
interface CitationsListProps {
  citations: Citation[];
  onCitationClick?: (index: number) => void;
  onViewDocument?: (citation: Citation) => void;
  highlightedIndex?: number;
  className?: string;
}

export function CitationsList({ 
  citations, 
  onCitationClick: _onCitationClick, 
  onViewDocument,
  highlightedIndex,
  className 
}: CitationsListProps) {
  if (!citations || citations.length === 0) {
    return (
      <div className={cn('mt-6', className)}>
        <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
          Citations
        </h4>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No citations returned for this response.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('mt-6', className)}>
      <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
        Citations ({citations.length})
      </h4>
      <div className="space-y-3">
        {citations.map((citation, index) => (
          <CitationCard
            key={citation.id || index}
            citation={citation}
            index={index}
            isHighlighted={highlightedIndex === index}
            onViewDocument={onViewDocument}
          />
        ))}
      </div>
    </div>
  );
}

// Component for broken citation markers
export function BrokenCitationMarker({ citationId: _citationId }: { citationId: string }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center w-5 h-5 text-xs font-medium',
        'bg-red-100 text-red-700 rounded-full cursor-help',
        'dark:bg-red-900/30 dark:text-red-400'
      )}
      title={`Citation ${_citationId} not found`}
      aria-label={`Citation ${_citationId} not available`}
    >
      ?
    </button>
  );
}