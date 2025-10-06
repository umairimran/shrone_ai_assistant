'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { useChat } from '@/context/ChatContext';
import { FileDropZone } from '@/components/FileDropZone';
import { UploadedFileItem } from '@/components/UploadedFileItem';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const categories = [
  'Board and Committee Proceedings',
  'By-Laws & Governance Policies',
  'External Advocacy &  Communications',
  'Policy & Position Statements',
  'Resolutions'
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const {
    documents,
    activeDocumentId,
    setActiveDocument,
    uploadFiles,
    deleteDocument,
    activeCategory,
    setActiveCategory
  } = useChat();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const dropErrorTimerRef = useRef<number | null>(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement | null>(null);

  const handleClickOutside = useCallback(() => {
    setCategoryDropdownOpen(false);
  }, []);

  useOnClickOutside(categoryDropdownRef, handleClickOutside);

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  }, []);

  const trapFocus = useCallback(
    (event: KeyboardEvent) => {
      if (!panelRef.current || !isOpen) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.key === 'Tab') {
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    if (!isOpen || !isMobile) return;
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), select'
    );
    firstFocusable?.focus();
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
    };
  }, [isMobile, isOpen, trapFocus]);

  useEffect(() => {
    return () => {
      if (dropErrorTimerRef.current) {
        clearTimeout(dropErrorTimerRef.current);
      }
    };
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const result = await uploadFiles(files);
      if (result === 'ok') {
        setDropError(null);
        return;
      }
      const message =
        result === 'invalid'
          ? 'Only PDF, DOC, DOCX, or TXT files up to 200MB are supported.'
          : 'Upload failed. Please try again.';
      setDropError(message);
      if (dropErrorTimerRef.current) {
        clearTimeout(dropErrorTimerRef.current);
      }
      dropErrorTimerRef.current = window.setTimeout(() => setDropError(null), 3000);
    },
    [uploadFiles]
  );

  const content = (
    <aside
      ref={panelRef}
      className={cn(
        'sticky top-0 flex h-screen flex-col gap-6 overflow-y-auto border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-900 px-5 py-6 text-sm shadow-sm',
        'w-full',
        'scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-600'
      )}
      aria-label="Sidebar"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgb(209 213 219) transparent'
      }}
    >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500 text-sm font-bold text-white shadow-sm">
              SC
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Shrone</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Document Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle size="sm" className="hidden lg:flex" />
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
              onClick={onClose}
              aria-label="Close sidebar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Navigation Links */}
        <div className="space-y-1 mb-6">
          <a
            href="/management"
            className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
            </svg>
            Document Management
          </a>
        </div>

      <div className="space-y-2">
        <label
          htmlFor="category-select"
          className="text-xs font-medium text-gray-500 dark:text-gray-400"
          id="category-label"
        >
          Category
        </label>
        <div className="relative" ref={categoryDropdownRef}>
          {/* Selected value button */}
          <button
            type="button"
            onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-left text-xs text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            aria-haspopup="listbox"
            aria-expanded={categoryDropdownOpen}
            aria-labelledby="category-label"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate" title={activeCategory}>{activeCategory}</span>
              <svg 
                className={cn(
                  'h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0 transition-transform duration-200',
                  categoryDropdownOpen && 'rotate-180'
                )}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {/* Dropdown menu */}
          {categoryDropdownOpen && (
            <div 
              className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-60 overflow-auto animate-in fade-in slide-in-from-top-2 duration-200"
              role="listbox"
              aria-labelledby="category-label"
            >
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setActiveCategory(category);
                    setCategoryDropdownOpen(false);
                  }}
                  className={cn(
                    'w-full px-3 py-2.5 text-left text-xs transition-colors',
                    category === activeCategory
                      ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
                      : 'text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                  )}
                  role="option"
                  aria-selected={category === activeCategory}
                >
                  <span className="block truncate" title={category}>{category}</span>
                </button>
              ))}
            </div>
          )}
          <span id="category-help" className="sr-only">
            Select a document category to filter conversations
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Upload Document</p>
        <FileDropZone onFiles={handleFiles} error={Boolean(dropError)} />
        {dropError && <p className="text-xs text-red-500 dark:text-red-400">{dropError}</p>}
      </div>

      <nav className="flex-1 space-y-3 overflow-hidden" aria-label="Document list">
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400" id="documents-heading">
          Documents ({documents.length})
        </h3>
        <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-480px)] pr-1">
          {documents.length > 0 ? (
            <ul role="list" aria-labelledby="documents-heading" className="space-y-2">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <UploadedFileItem
                    doc={doc}
                    onDelete={deleteDocument}
                    onSelect={setActiveDocument}
                    isActive={doc.id === activeDocumentId}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8" role="status" aria-live="polite">
              <p className="text-sm text-gray-400 dark:text-gray-500">No documents yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">Upload files to get started</p>
            </div>
          )}
        </div>
      </nav>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block">{content}</div>
      <div
        className={cn(
          'fixed inset-0 z-30 bg-black/50 transition-opacity lg:hidden',
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 max-w-full transform border-r border-white/10 bg-[#12171f] shadow-2xl transition-transform duration-200 sm:w-80 lg:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {content}
      </div>
    </>
  );
}
