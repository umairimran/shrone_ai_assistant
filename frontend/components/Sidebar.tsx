'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useChat } from '@/context/ChatContext';
import { FileDropZone } from '@/components/FileDropZone';
import { UploadedFileItem } from '@/components/UploadedFileItem';

const categories = [
  'Board & Committee Proceedings',
  'Bylaws & Governance Policies',
  'External Advocacy & Communications',
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
        'sticky top-0 flex h-screen flex-col gap-6 overflow-y-auto border-r border-white/10 bg-[#12171f] px-4 py-6 text-sm text-[#e5e7eb] shadow-xl',
        'w-full'
      )}
      aria-label="Sidebar"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-900/40 text-sm font-bold text-blue-200">
            LA
          </div>
          <div>
            <p className="text-base font-semibold">Shrone Chatbot</p>
            <p className="text-xs text-[#9aa3af]">Document Assistant</p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-xs text-[#9aa3af] transition hover:border-white/30 hover:text-[#e5e7eb] lg:hidden"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-[#9aa3af]">Select Category For Chat</p>
        <div className="rounded-lg border border-white/10 bg-[#0f141a] px-3 py-2">
          <label htmlFor="document-select" className="sr-only">
            Select category
          </label>
          <select
            id="category-select"
            value={activeCategory}
            onChange={(event) => setActiveCategory(event.target.value)}
            className="w-full bg-transparent text-sm text-[#e5e7eb] outline-none"
          >
            {categories.map((category) => (
              <option key={category} value={category} className="bg-[#0f141a] text-[#e5e7eb]">
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-[#9aa3af]">Document Management</p>
        <FileDropZone onFiles={handleFiles} error={Boolean(dropError)} />
        {dropError && <p className="text-xs text-red-400">{dropError}</p>}
      </div>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-[#9aa3af]">Uploaded Documents</p>
        <div className="space-y-3">
          {documents.map((doc) => (
            <UploadedFileItem
              key={doc.id}
              doc={doc}
              onDelete={deleteDocument}
              onSelect={setActiveDocument}
              isActive={doc.id === activeDocumentId}
            />
          ))}
          {documents.length === 0 && (
            <p className="text-xs text-[#9aa3af]">No documents uploaded yet.</p>
          )}
        </div>
      </div>
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
