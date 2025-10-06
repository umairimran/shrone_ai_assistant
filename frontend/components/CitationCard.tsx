'use client';

import React from 'react';
import { Citation } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

// Helper functions to extract citation data from nested or flat structure
function getCitationTitle(citation: Citation): string {
  return citation.document?.title || citation.title || 'Untitled Document';
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

interface CitationCardProps {
  citation: Citation;
  index: number;
  isHighlighted?: boolean;
  onViewDocument?: (citation: Citation) => void; // Keep for compatibility but not used
  className?: string;
}

export function CitationCard({ 
  citation, 
  index, 
  isHighlighted = false, 
  onViewDocument: _onViewDocument, 
  className 
}: CitationCardProps) {
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
                {getCitationTitle(citation)}
              </h4>
              {/* Display section information */}
              {getCitationSection(citation) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Section: {getCitationSection(citation)}
                </p>
              )}
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

        {/* Quote */}
        {citation.quote && (
          <blockquote className="border-l-3 border-blue-500 pl-3 py-1 mb-3 bg-gray-50 dark:bg-gray-700/50 rounded-r">
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed italic">
              "{citation.quote}"
            </p>
          </blockquote>
        )}
      </div>
    </div>
  );
}

// Format citation text for copying
function formatCitationText(citation: Citation, index: number): string {
  const parts = [`[${index + 1}]`, getCitationTitle(citation)];
  
  const category = getCitationCategory(citation);
  if (category) {
    parts.push(category);
  }
  
  const section = getCitationSection(citation);
  if (section) {
    parts.push(`Section: ${section}`);
  }
  
  const date = getCitationDate(citation);
  if (date) {
    parts.push(formatDisplayDate(date));
  }
  
  // Legacy support
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