'use client';

import React from 'react';
import { Citation } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
import { trackMissingSourceLink } from '@/services/TelemetryService';

// Helper functions to extract citation data from nested or flat structure
function getCitationTitle(citation: Citation): string {
  return citation.document?.title || citation.title || citation.doc_title || 'Untitled Document';
}

function getCitationCategory(citation: Citation): string | undefined {
  return citation.document?.category || citation.category;
}

function getCitationSection(citation: Citation): string | undefined {
  return citation.document?.section || citation.section;
}

function getCitationDate(citation: Citation): string | undefined {
  return citation.document?.date || citation.date;
}

// Format date for display
function formatDisplayDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    // Check if it's just a year (ends with -01-01)
    if (dateString.endsWith('-01-01')) {
      return date.getFullYear().toString();
    }
    // Format as readable date
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateString; // Return original if parsing fails
  }
}

interface CitationCardProps {
  citation: Citation;
  index: number;
  isHighlighted?: boolean;
  onViewDocument?: (_citation: Citation) => void;
  className?: string;
}

export function CitationCard({ 
  citation, 
  index, 
  isHighlighted = false, 
  onViewDocument: _onViewDocument, 
  className 
}: CitationCardProps) {
  // Track missing source links for quality monitoring
  React.useEffect(() => {
    const isDocumentAvailable = citation.link || citation.page_span;
    if (!isDocumentAvailable) {
      trackMissingSourceLink(
        citation.id || `${index + 1}`,
        index,
        getCitationTitle(citation)
      );
    }
  }, [citation.id, citation.link, citation.page_span, index]);

  return (
    <div
      id={`citation-${index + 1}`}
      className={cn(
        'group relative rounded-lg border p-3 sm:p-4 transition-all duration-200',
        'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
        'hover:border-blue-500 hover:shadow-sm',
        isHighlighted && 'border-blue-500 shadow-sm',
        className
      )}
    >
      <div className="p-2 sm:p-4">
        {/* Citation Header */}
        <div className="flex items-start justify-between gap-2 sm:gap-4 mb-3">
          <div className="flex items-center gap-2 sm:gap-3">
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
                {getCitationTitle(citation)}
              </h4>
              {/* Display section information - COMMENTED OUT */}
              {/* {getCitationSection(citation) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Section: {getCitationSection(citation)}
                </p>
              )} */}
              {/* Display legacy hierarchy path for backward compatibility */}
              {!getCitationSection(citation) && citation.hierarchy_path && (
                <Tooltip 
                  content={
                    <div className="max-w-xs">
                      <div className="font-semibold mb-1">Document Structure:</div>
                      <div className="text-xs opacity-90">{citation.hierarchy_path}</div>
                      {getCitationSection(citation) && (
                        <div className="text-xs opacity-75 mt-1">Section: {getCitationSection(citation)}</div>
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

        </div>

        {/* Citation Metadata */}
        <div className="flex flex-wrap gap-2 mb-3">
          {/* Category */}
          {getCitationCategory(citation) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-green-100 dark:bg-green-900/30 text-xs font-medium text-green-700 dark:text-green-300">
              {getCitationCategory(citation)}
            </span>
          )}
          
          {/* Date */}
          {getCitationDate(citation) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/30 text-xs font-medium text-purple-700 dark:text-purple-300">
              {formatDisplayDate(getCitationDate(citation)!)}
            </span>
          )}
          
          {/* Legacy pages support */}
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

        {/* Quote - Shortened version */}
        {citation.quote && (
          <blockquote className="border-l-3 border-blue-500 pl-3 py-1 mb-3 bg-gray-50 dark:bg-gray-700/50 rounded-r">
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed italic line-clamp-2">
              "{citation.quote.length > 150 ? citation.quote.substring(0, 150) + '...' : citation.quote}"
            </p>
          </blockquote>
        )}
      </div>
    </div>
  );
}

// Citations List Container
interface CitationsListProps {
  citations: Citation[];
  onCitationClick?: (_index: number) => void;
  onViewDocument?: (_citation: Citation) => void;
  highlightedIndex?: number;
  className?: string;
  maxVisibleCitations?: number; // Number of citations to show initially
}

export function CitationsList({ 
  citations, 
  onCitationClick: _onCitationClick, 
  onViewDocument,
  highlightedIndex,
  className,
  maxVisibleCitations = 2 // Show 2 citations by default
}: CitationsListProps) {
  const [showAll, setShowAll] = React.useState(false);
  
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

  const hasMoreCitations = citations.length > maxVisibleCitations;
  const visibleCitations = showAll ? citations : citations.slice(0, maxVisibleCitations);
  const hiddenCount = citations.length - maxVisibleCitations;

  return (
    <div className={cn('mt-6', className)}>
      <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
        Citations ({citations.length})
      </h4>
      <div className="space-y-3" id="citations-list">
        {visibleCitations.map((citation, index) => (
          <div
            key={citation.id || index}
            className={cn(
              'transform transition-all duration-300 ease-in-out',
              index >= maxVisibleCitations && !showAll ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            )}
          >
            <CitationCard
              citation={citation}
              index={index}
              isHighlighted={highlightedIndex === index}
              onViewDocument={onViewDocument}
            />
          </div>
        ))}
        
        {/* Show More/Less Button */}
        {hasMoreCitations && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setShowAll(!showAll)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
                'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                'hover:bg-blue-100 dark:hover:bg-blue-900/50',
                'border border-blue-200 dark:border-blue-700',
                'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                'transform hover:scale-[1.02] active:scale-[0.98]'
              )}
              aria-expanded={showAll}
              aria-controls="citations-list"
              aria-label={showAll ? `Hide ${hiddenCount} citations` : `Show ${hiddenCount} more citations`}
            >
              {showAll ? (
                <>
                  <span>Show Less</span>
                  <svg className="w-4 h-4 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </>
              ) : (
                <>
                  <span>Show {hiddenCount} More Citation{hiddenCount > 1 ? 's' : ''}</span>
                  <svg className="w-4 h-4 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </>
              )}
            </button>
          </div>
        )}
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