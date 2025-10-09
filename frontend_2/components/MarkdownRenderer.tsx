'use client';

import React, { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  onCitationClick?: (citationId: string) => void;
  className?: string;
}


// Custom components for markdown elements
const markdownComponents = {
  // Headers
  h1: ({ children, ...props }: any) => (
    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 mt-6 first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: any) => (
    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3 mt-5 first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: any) => (
    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2 mt-4 first:mt-0" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }: any) => (
    <h4 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-2 mt-3 first:mt-0" {...props}>
      {children}
    </h4>
  ),
  h5: ({ children, ...props }: any) => (
    <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1 mt-2 first:mt-0" {...props}>
      {children}
    </h5>
  ),
  h6: ({ children, ...props }: any) => (
    <h6 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1 mt-2 first:mt-0" {...props}>
      {children}
    </h6>
  ),

  // Paragraphs
  p: ({ children, ...props }: any) => (
    <p className="text-gray-700 dark:text-gray-300 leading-7 mb-4 last:mb-0" {...props}>
      {children}
    </p>
  ),

  // Lists
  ul: ({ children, ...props }: any) => (
    <ul className="list-disc list-outside space-y-2 mb-4 text-gray-700 dark:text-gray-300 pl-4" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: any) => (
    <ol className="list-decimal list-outside space-y-2 mb-4 text-gray-700 dark:text-gray-300 pl-4" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }: any) => (
    <li className="leading-6" {...props}>
      {children}
    </li>
  ),

  // Blockquotes
  blockquote: ({ children, ...props }: any) => (
    <blockquote 
      className="border-l-4 border-blue-500 dark:border-blue-400 pl-4 py-2 my-4 bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 italic" 
      {...props}
    >
      {children}
    </blockquote>
  ),

  // Code
  code: ({ children, className, ...props }: any) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code 
          className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-1.5 py-0.5 rounded text-sm font-mono" 
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }: any) => (
    <pre 
      className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-4 rounded-lg overflow-x-auto mb-4 text-sm font-mono" 
      {...props}
    >
      {children}
    </pre>
  ),

  // Links
  a: ({ children, href, ...props }: any) => (
    <a 
      href={href} 
      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline" 
      target="_blank" 
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),

  // Strong and emphasis
  strong: ({ children, ...props }: any) => (
    <strong className="font-semibold text-gray-900 dark:text-gray-100" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: any) => (
    <em className="italic text-gray-800 dark:text-gray-200" {...props}>
      {children}
    </em>
  ),

  // Horizontal rule
  hr: ({ ...props }: any) => (
    <hr className="border-gray-300 dark:border-gray-600 my-6" {...props} />
  ),

  // Tables
  table: ({ children, ...props }: any) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full border border-gray-300 dark:border-gray-600 rounded-lg" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: any) => (
    <thead className="bg-gray-50 dark:bg-gray-800" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }: any) => (
    <tbody className="divide-y divide-gray-200 dark:divide-gray-700" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }: any) => (
    <tr {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }: any) => (
    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: any) => (
    <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100" {...props}>
      {children}
    </td>
  ),
};

export function MarkdownRenderer({ content, onCitationClick, className }: MarkdownRendererProps) {
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

  // Post-process citations after markdown is rendered
  useEffect(() => {
    if (!contentRef.current) return;

    const container = contentRef.current;
    const citationRegex = /\[(\d+)\]/g;
    
    // Find all text nodes and replace citation markers
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }

    textNodes.forEach(textNode => {
      if (citationRegex.test(textNode.textContent || '')) {
        const parent = textNode.parentNode;
        if (parent && parent.nodeName !== 'BUTTON') {
          const html = textNode.textContent?.replace(
            citationRegex,
            '<button class="citation-marker inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-blue-600 bg-blue-100 rounded-full hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors cursor-pointer dark:text-blue-400 dark:bg-blue-900/30 dark:hover:bg-blue-800/40" data-citation-id="$1" aria-label="Citation $1" title="Click to view citation $1">$1</button>'
          );
          if (html && html !== textNode.textContent) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            while (tempDiv.firstChild) {
              parent.insertBefore(tempDiv.firstChild, textNode);
            }
            parent.removeChild(textNode);
          }
        }
      }
    });
  }, [content]);

  return (
    <div
      ref={contentRef}
      className={cn('prose prose-sm max-w-none w-full', className)}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Hook for citation interactions (reused from AnswerContent)
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
