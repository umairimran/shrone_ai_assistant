'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn, formatTime } from '@/lib/utils';
import { ConversationSummary } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface ConversationHistoryProps {
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  onLoadConversation: (_conversationId: string) => void;
  onDeleteConversation?: (_conversationId: string) => void;
  onRenameConversation?: (_conversationId: string, _newTitle: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function ConversationHistory({
  conversations,
  currentConversationId,
  onLoadConversation,
  onDeleteConversation,
  onRenameConversation,
  isLoading = false,
  className
}: ConversationHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [editingConversation, setEditingConversation] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Group conversations by date
  const groupedConversations = useMemo(() => {
    const filtered = conversations.filter(conv =>
      conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.snippet.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.firstUserMessage.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const groups: { [key: string]: ConversationSummary[] } = {};
    const now = new Date();
    
    filtered.forEach(conv => {
      const convDate = new Date(conv.updatedAt);
      const diffTime = Math.abs(now.getTime() - convDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let groupKey: string;
      if (diffDays === 1) {
        groupKey = 'Today';
      } else if (diffDays <= 2) {
        groupKey = 'Yesterday';
      } else if (diffDays <= 7) {
        groupKey = 'This Week';
      } else if (diffDays <= 30) {
        groupKey = 'This Month';
      } else if (diffDays <= 90) {
        groupKey = 'Last 3 Months';
      } else {
        groupKey = 'Older';
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(conv);
    });

    // Sort within groups by date (most recent first)
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });

    return groups;
  }, [conversations, searchQuery]);

  const handleDeleteClick = useCallback((conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversationToDelete(conversationId);
    setShowDeleteDialog(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (conversationToDelete && onDeleteConversation) {
      onDeleteConversation(conversationToDelete);
    }
    setShowDeleteDialog(false);
    setConversationToDelete(null);
  }, [conversationToDelete, onDeleteConversation]);

  const handleRenameClick = useCallback((conversationId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConversation(conversationId);
    setEditTitle(currentTitle);
  }, []);

  const handleRenameConfirm = useCallback(() => {
    if (editingConversation && onRenameConversation && editTitle.trim()) {
      onRenameConversation(editingConversation, editTitle.trim());
    }
    setEditingConversation(null);
    setEditTitle('');
  }, [editingConversation, onRenameConversation, editTitle]);

  const handleRenameCancel = useCallback(() => {
    setEditingConversation(null);
    setEditTitle('');
  }, []);

  if (isLoading) {
    return (
      <div className={cn('p-8 text-center', className)}>
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading conversations...</p>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className={cn('p-8 text-center', className)}>
        <div className="text-gray-500 dark:text-gray-400">
          <svg className="h-12 w-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No conversations yet</h3>
          <p className="text-sm">Start a conversation to see your chat history here.</p>
        </div>
      </div>
    );
  }

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'This Month', 'Last 3 Months', 'Older'];

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Search */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm',
              'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100',
              'placeholder-gray-500 dark:placeholder-gray-400'
            )}
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {groupOrder.map(groupName => {
          const groupConversations = groupedConversations[groupName];
          if (!groupConversations || groupConversations.length === 0) return null;

          return (
            <div key={groupName} className="pb-4">
              <div className="sticky top-0 bg-gray-50 dark:bg-gray-800/50 px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700">
                {groupName}
              </div>
              <div className="p-2 space-y-1">
                {groupConversations.map((conversation) => {
                  const isActive = currentConversationId === conversation.id;
                  const isEditing = editingConversation === conversation.id;

                  return (
                    <div
                      key={conversation.id}
                      className={cn(
                        'group rounded-lg p-3 cursor-pointer transition-all duration-200',
                        'hover:bg-gray-100 dark:hover:bg-gray-800',
                        isActive 
                          ? 'bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-500' 
                          : 'hover:border-l-4 hover:border-gray-300 dark:hover:border-gray-600'
                      )}
                      onClick={() => !isEditing && onLoadConversation(conversation.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {/* Title */}
                          {isEditing ? (
                            <div className="mb-2" onClick={e => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameConfirm();
                                  if (e.key === 'Escape') handleRenameCancel();
                                }}
                                className="w-full px-2 py-1 text-sm font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                autoFocus
                              />
                              <div className="flex gap-1 mt-1">
                                <Button size="sm" onClick={handleRenameConfirm}>
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleRenameCancel}>
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <h4 className={cn(
                              'text-sm font-medium line-clamp-2 mb-1',
                              isActive ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'
                            )}>
                              {conversation.title}
                            </h4>
                          )}

                          {/* Snippet */}
                          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                            {conversation.snippet}
                          </p>

                          {/* Metadata */}
                          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span>{formatTime(conversation.updatedAt)}</span>
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              {conversation.messageCount}
                            </span>
                            {conversation.citationCount && conversation.citationCount > 0 && (
                              <span className="flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {conversation.citationCount}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        {!isEditing && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {onRenameConversation && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleRenameClick(conversation.id, conversation.title, e)}
                                className="p-1"
                                title="Rename conversation"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </Button>
                            )}
                            
                            {onDeleteConversation && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleDeleteClick(conversation.id, e)}
                                className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                title="Delete conversation"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Conversation"
        message="Are you sure you want to delete this conversation? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}