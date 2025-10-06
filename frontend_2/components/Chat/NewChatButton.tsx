'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface NewChatButtonProps {
  onNewChat: () => void;
  hasMessages: boolean;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showConfirmation?: boolean;
}

export function NewChatButton({ 
  onNewChat, 
  hasMessages, 
  className,
  variant = 'primary',
  size = 'md',
  showConfirmation = true
}: NewChatButtonProps) {
  const [showDialog, setShowDialog] = useState(false);

  const handleClick = useCallback(() => {
    if (hasMessages && showConfirmation) {
      setShowDialog(true);
    } else {
      onNewChat();
    }
  }, [hasMessages, showConfirmation, onNewChat]);

  const handleConfirm = useCallback(() => {
    onNewChat();
    setShowDialog(false);
  }, [onNewChat]);

  const variantStyles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
    secondary: 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600',
    ghost: 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={cn(
          'inline-flex items-center gap-2 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        title="Start a new conversation"
        aria-label="Start new chat"
      >
        <svg 
          className={cn('flex-shrink-0', size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4')} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span>New Chat</span>
      </button>

      <ConfirmDialog
        isOpen={showDialog}
        onClose={() => setShowDialog(false)}
        onConfirm={handleConfirm}
        title="Start New Conversation"
        message="Are you sure you want to start a new conversation? Your current conversation will be saved to history."
        confirmText="Start New Chat"
        cancelText="Cancel"
        variant="info"
      />
    </>
  );
}