'use client';

import React, { useRef } from 'react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { NewChatButton } from './NewChatButton';
import { CategorySelector } from '@/components/CategorySelector';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import DocumentCacheService from '@/services/DocumentCacheService';

interface ConversationSidebarProps {
  // Conversation actions
  onNewChat: () => void;
  
  // UI props
  isOpen: boolean;
  onClose: () => void;
  hasMessages: boolean;
  className?: string;
}

export function ConversationSidebar({
  onNewChat,
  isOpen,
  onClose,
  hasMessages,
  className
}: ConversationSidebarProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useOnClickOutside(panelRef, () => {
    if (isOpen) onClose();
  });

  const handleDocumentManagementClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Navigate immediately to management page
    window.location.href = '/management';
  };

  const content = (
    <aside
      ref={panelRef}
      className={cn(
        'sticky top-0 flex h-screen flex-col overflow-hidden border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-900 shadow-sm',
        'w-full',
        className
      )}
      aria-label="Conversation History"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500 text-sm font-bold text-white shadow-sm">
              SH
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Sharon</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Document Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle size="sm" className="hidden lg:flex" />
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
            onClick={onClose}
            aria-label="Close conversation history"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* New Chat Button */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <NewChatButton
          onNewChat={onNewChat}
          hasMessages={hasMessages}
          variant="primary"
          size="md"
          className="w-full justify-center"
          showConfirmation={false}
        />
      </div>

      {/* Navigation Links */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={handleDocumentManagementClick}
          className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors w-full text-left"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
          </svg>
          Document Management
        </button>
      </div>

      {/* Category Selection */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
            Select Category
          </h3>
          <CategorySelector />
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">{content}</div>
      
      {/* Mobile Overlay */}
      <div
        className={cn(
          'fixed inset-0 z-30 bg-black/50 transition-opacity lg:hidden',
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Mobile Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-80 max-w-full transform transition-transform duration-200 lg:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {content}
      </div>
    </>
  );
}