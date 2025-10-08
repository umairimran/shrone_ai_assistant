'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ChatMessage, Citation } from '@/lib/types';
import { cn, formatTime } from '@/lib/utils';
import { AnswerContent, useCitationInteractions, ProcessingStatusIndicator } from '@/components/AnswerContent';
import { useRouter } from 'next/navigation';
import { trackCitationClick, trackCitationHighlight } from '@/services/TelemetryService';
import { CitationsList } from '@/components/CitationCard';

interface MessageItemProps {
  message: ChatMessage;
}


type AnswerBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'unordered-list'; items: string[] }
  | { kind: 'ordered-list'; items: string[]; start?: number; listStyle: 'decimal' | 'lower-alpha' | 'upper-alpha' };

const isBulletLine = (line: string) => /^[-*•]\s+/.test(line);
const isNumericLine = (line: string) => /^\d+[.)]\s+/.test(line);
const isAlphaLine = (line: string) => /^[a-zA-Z]\)\s+/.test(line);

const stripPrefix = (line: string) =>
  line
    .replace(/^[-*•]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^[a-zA-Z]\)\s+/, '')
    .replace(/[;:,]\s*$/, '')
    .trim();

function parseAnswerContent(content: string): AnswerBlock[] {
  if (!content.trim()) return [];

  let normalized = content.replace(/\r\n/g, '\n');
  normalized = normalized.replace(/:\s*([a-zA-Z]\))/g, ':\n$1');
  normalized = normalized.replace(/:\s*(\d+[.)])/g, ':\n$1');
  normalized = normalized.replace(/;\s*([a-zA-Z]\))/g, ';\n$1');
  normalized = normalized.replace(/;\s*(\d+[.)])/g, ';\n$1');

  const rawBlocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const blocks: AnswerBlock[] = [];

  const pushList = (
    kind: AnswerBlock['kind'],
    lines: string[],
    listStyle: 'decimal' | 'lower-alpha' | 'upper-alpha' | null = null
  ) => {
    if (!lines.length) return;
    if (kind === 'unordered-list') {
      blocks.push({ kind, items: lines.map(stripPrefix).filter(Boolean) });
      return;
    }

    if (kind === 'ordered-list') {
      const first = lines[0];
      const numericMatch = first.match(/^(\d+)[.)]\s+/);
      const alphaMatch = first.match(/^([a-zA-Z])\)\s+/);

      let start: number | undefined;
      let resolvedStyle: 'decimal' | 'lower-alpha' | 'upper-alpha' = 'decimal';

      if (numericMatch) {
        start = Number(numericMatch[1]);
        resolvedStyle = 'decimal';
      } else if (alphaMatch) {
        const letter = alphaMatch[1];
        start = letter.toLowerCase().charCodeAt(0) - 96;
        resolvedStyle = letter === letter.toUpperCase() ? 'upper-alpha' : 'lower-alpha';
      } else if (listStyle) {
        resolvedStyle = listStyle;
      }

      blocks.push({
        kind,
        items: lines.map(stripPrefix).filter(Boolean),
        start,
        listStyle: resolvedStyle
      });
    }
  };

  rawBlocks.forEach((block) => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      return;
    }

    const first = lines[0];
    const rest = lines.slice(1);

    const restAre = {
      bullet: rest.length > 0 && rest.every(isBulletLine),
      numeric: rest.length > 0 && rest.every(isNumericLine),
      alpha: rest.length > 0 && rest.every(isAlphaLine)
    };

    if (lines.every(isBulletLine)) {
      pushList('unordered-list', lines);
      return;
    }

    if (lines.every(isNumericLine)) {
      pushList('ordered-list', lines, 'decimal');
      return;
    }

    if (lines.every(isAlphaLine)) {
      pushList('ordered-list', lines, 'lower-alpha');
      return;
    }

    if (restAre.bullet) {
      blocks.push({ kind: 'paragraph', text: first });
      pushList('unordered-list', rest);
      return;
    }

    if (restAre.numeric) {
      blocks.push({ kind: 'paragraph', text: first });
      pushList('ordered-list', rest, 'decimal');
      return;
    }

    if (restAre.alpha) {
      blocks.push({ kind: 'paragraph', text: first });
      pushList('ordered-list', rest, 'lower-alpha');
      return;
    }

    blocks.push({ kind: 'paragraph', text: lines.join(' ') });
  });

  return blocks;
}


export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';
  const [displayTime, setDisplayTime] = useState('');
  const [highlightedCitationIndex, setHighlightedCitationIndex] = useState<number | undefined>();
  const { scrollToCitation } = useCitationInteractions();
  const _router = useRouter();
  
  // Use HTML content if available, otherwise fall back to parsed content
  const hasHtmlContent = !isUser && message.answer_html;
  const answerBlocks = useMemo(() => 
    !hasHtmlContent ? parseAnswerContent(message.content) : [], 
    [message.content, hasHtmlContent]
  );

  useEffect(() => {
    setDisplayTime(formatTime(message.createdAt));
  }, [message.createdAt]);

  // Handle URL fragment navigation to citations
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#cite-c')) {
        const citationId = hash.replace('#cite-c', '');
        const index = parseInt(citationId, 10) - 1;
        if (index >= 0 && message.citations && index < message.citations.length) {
          const citation = message.citations[index];
          
          setHighlightedCitationIndex(index);
          scrollToCitation(citationId);
          
          // Track deep link citation highlight
          trackCitationHighlight(
            citation.id || citationId,
            index,
            citation.doc_title
          );
          
          // Clear highlight after 5 seconds for deep links
          setTimeout(() => {
            setHighlightedCitationIndex(undefined);
          }, 5000);
        }
      }
    };

    // Handle initial hash on mount
    handleHashChange();
    
    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [message.citations, scrollToCitation]);

  const handleCitationClick = useCallback((citationId: string) => {
    const index = parseInt(citationId, 10) - 1;
    if (index >= 0 && message.citations && index < message.citations.length) {
      const citation = message.citations[index];
      
      setHighlightedCitationIndex(index);
      scrollToCitation(citationId);
      
      // Track citation click event
      trackCitationClick(
        citation.id || citationId,
        index,
        citation.doc_title,
        citation.confidence_score
      );
      
      // Track citation highlight event
      trackCitationHighlight(
        citation.id || citationId,
        index,
        citation.doc_title
      );
      
      // Update URL fragment for deep linking
      const newUrl = `${window.location.pathname}${window.location.search}#cite-c${citationId}`;
      window.history.replaceState(null, '', newUrl);
      
      // Clear highlight after 3 seconds
      setTimeout(() => {
        setHighlightedCitationIndex(undefined);
      }, 3000);
    }
  }, [message.citations, scrollToCitation]);

  const handleViewDocument = (citation: Citation) => {
    // This will be implemented when we add the document viewer
    console.log('View document:', citation);
  };

  return (
    <article 
      className={cn('flex items-start gap-3 sm:gap-4 animate-slide-in', isUser ? 'flex-row-reverse sm:flex-row' : '')}
      aria-label={`${isUser ? 'Your' : 'Assistant'} message from ${formatTime(message.createdAt)}`}
    >
      <div
        role="img"
        aria-label={isUser ? 'Your avatar' : 'Assistant avatar'}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold shrink-0',
          isUser 
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            : 'bg-blue-500 text-white'
        )}
      >
        {isUser ? 'Y' : 'AI'}
      </div>
      <div className={cn('flex-1 min-w-0 max-w-[90%] sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl', isUser ? 'text-right sm:text-left' : 'text-left')}>
        <div
          className={cn(
            'group relative rounded-xl px-4 py-3 border transition-colors',
            isUser 
              ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              : 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
          )}
          role="region"
          aria-label="Message content"
        >
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed text-gray-900 dark:text-gray-100">{message.content}</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Answer</h3>
                  {message.processingStatus && (
                    <ProcessingStatusIndicator 
                      status={message.processingStatus} 
                      details={message.processingDetails}
                    />
                  )}
                </div>
                
                {/* Render content using AnswerContent with markdown support */}
                <AnswerContent 
                  html={message.answer_html} 
                  markdown={message.content}
                  onCitationClick={handleCitationClick}
                  className="text-gray-900 dark:text-gray-100"
                />
              </div>
              
              {/* Enhanced Citations Display */}
              <CitationsList 
                citations={message.citations || []}
                onViewDocument={handleViewDocument}
                highlightedIndex={highlightedCitationIndex}
              />
            </div>
          )}
        </div>
        <time 
          dateTime={message.createdAt}
          className="mt-2 text-xs tracking-wide text-gray-500 dark:text-gray-500 block"
          aria-label={`Sent at ${formatTime(message.createdAt)}`}
        >
          {displayTime || ' '}
        </time>
      </div>
    </article>
  );
}
