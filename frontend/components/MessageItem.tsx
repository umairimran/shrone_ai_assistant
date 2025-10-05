'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChatMessage, Citation } from '@/lib/types';
import { cn, formatTime } from '@/lib/utils';

interface MessageItemProps {
  message: ChatMessage;
}

const normalizeValue = (value?: string | null) => {
  if (!value) return null;
  const trimmed = `${value}`.replace(/\s+/g, ' ').trim();
  if (!trimmed || /^none(?:–none)?$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
};

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

function formatCitation(citation: Citation): string {
  const scopedDoc = (typeof citation.document === 'object' && citation.document) || {};

  const title =
    normalizeValue(citation.title) ?? normalizeValue(scopedDoc.title) ?? 'Untitled source';
  const category = normalizeValue(citation.category) ?? normalizeValue(scopedDoc.category);
  const section = normalizeValue(citation.section) ?? normalizeValue(scopedDoc.section);
  const yearValue = normalizeValue(citation.year) ?? normalizeValue(scopedDoc.year);
  const pages = normalizeValue(citation.pages) ?? normalizeValue(scopedDoc.pages);
  const heading = normalizeValue(citation.heading_path) ?? normalizeValue(scopedDoc.heading_path);

  const formattedSection = section
    ? section.match(/^section/i)
      ? section
      : `Section ${section}`
    : null;

  const formattedYear = yearValue ? `${yearValue}` : null;

  const parts = [title];

  if (category) parts.push(category);
  if (formattedSection) parts.push(formattedSection);
  if (formattedYear) parts.push(formattedYear);
  if (pages) parts.push(pages.toLowerCase().startsWith('p.') ? pages : `p.${pages}`);
  if (heading) parts.push(heading);

  return parts.filter(Boolean).join(' · ');
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';
  const [displayTime, setDisplayTime] = useState('');
  const answerBlocks = useMemo(() => parseAnswerContent(message.content), [message.content]);

  useEffect(() => {
    setDisplayTime(formatTime(message.createdAt));
  }, [message.createdAt]);

  return (
    <div className={cn('flex items-start gap-3', isUser ? 'flex-row-reverse sm:flex-row' : '')}>
      <span
        aria-hidden
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-black/80 shadow-md',
          isUser ? 'bg-red-500/80' : 'bg-yellow-400/80'
        )}
      >
        {isUser ? 'U' : 'A'}
      </span>
      <div className={cn('max-w-[85%] text-sm sm:max-w-2xl', isUser ? 'text-right sm:text-left' : 'text-left')}>
        <div
          className={cn(
            'rounded-2xl border border-white/5 px-4 py-3 shadow-sm',
            isUser ? 'bg-[#0f1216]' : 'bg-[#101318]'
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap leading-7 text-[#e5e7eb]">{message.content}</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-[#f3f4f6]">Answer</h3>
                <div className="space-y-2 text-sm leading-7 text-[#e5e7eb]">
                  {answerBlocks.length === 0 && (
                    <p className="whitespace-pre-wrap">No answer available.</p>
                  )}
                  {answerBlocks.map((block, index) => {
                    if (block.kind === 'paragraph') {
                      return (
                        <p key={`paragraph-${index}`} className="whitespace-pre-wrap">
                          {block.text}
                        </p>
                      );
                    }

                    if (block.kind === 'unordered-list') {
                      return (
                        <ul
                          key={`unordered-${index}`}
                          className="ml-5 list-disc space-y-1 whitespace-normal text-[#e5e7eb]"
                        >
                          {block.items.map((item, itemIndex) => (
                            <li key={`unordered-${index}-${itemIndex}`}>{item}</li>
                          ))}
                        </ul>
                      );
                    }

                    const listStyleType =
                      block.listStyle === 'lower-alpha'
                        ? 'lower-alpha'
                        : block.listStyle === 'upper-alpha'
                          ? 'upper-alpha'
                          : 'decimal';

                    return (
                      <ol
                        key={`ordered-${index}`}
                        className="ml-5 space-y-1 whitespace-normal text-[#e5e7eb]"
                        style={{ listStyleType }}
                        start={block.start}
                      >
                        {block.items.map((item, itemIndex) => (
                          <li key={`ordered-${index}-${itemIndex}`}>{item}</li>
                        ))}
                      </ol>
                    );
                  })}
                </div>
              </div>
              {message.citations && message.citations.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-[#9aa3af]">
                    Citations
                  </h4>
                  <ul className="mt-2 space-y-1 text-sm">
                    {message.citations.map((citation, index) => (
                      <li key={`${citation.title}-${index}`} className="text-blue-400">
                        <span className="font-medium">[{index + 1}]</span>&nbsp;
                        {formatCitation(citation)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="mt-2 text-xs uppercase tracking-wide text-white/40">
          {displayTime || ' '}
        </p>
      </div>
    </div>
  );
}
