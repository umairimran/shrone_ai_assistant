'use client';

import React, { useState, useMemo } from 'react';
import { ChatMessage } from '@/lib/types';
import { cn, formatTime } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useChat } from '@/context/ChatContext';

interface ConversationListProps {
  className?: string;
}

interface ConversationGroup {
  date: string;
  messages: ChatMessage[];
  questionCount: number;
  citationCount: number;
}

export function ConversationList({ className }: ConversationListProps) {
  const { messages } = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);

  // Group messages by conversation (user question + assistant answer)
  const conversations = useMemo(() => {
    const groups: ConversationGroup[] = [];
    let currentGroup: ChatMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      currentGroup.push(message);

      // If this is an assistant message and next is user (or end), close the group
      if (message.role === 'assistant' && (i === messages.length - 1 || messages[i + 1].role === 'user')) {
        const userMessages = currentGroup.filter(m => m.role === 'user');
        const assistantMessages = currentGroup.filter(m => m.role === 'assistant');
        const totalCitations = assistantMessages.reduce((acc, m) => acc + (m.citations?.length || 0), 0);

        if (currentGroup.length > 0) {
          groups.push({
            date: message.createdAt,
            messages: [...currentGroup],
            questionCount: userMessages.length,
            citationCount: totalCitations
          });
        }
        currentGroup = [];
      }
    }

    return groups.reverse(); // Most recent first
  }, [messages]);

  // Filter conversations based on search
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    
    const query = searchQuery.toLowerCase();
    return conversations.filter(conv => 
      conv.messages.some(msg => 
        msg.content.toLowerCase().includes(query) ||
        msg.answer_html?.toLowerCase().includes(query) ||
        msg.citations?.some(cite => 
          cite.doc_title.toLowerCase().includes(query) ||
          cite.quote?.toLowerCase().includes(query)
        )
      )
    );
  }, [conversations, searchQuery]);

  const handleExportConversation = (conversation: ConversationGroup) => {
    // This will trigger the export functionality
    console.log('Export conversation:', conversation);
  };

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
              'w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg',
              'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100',
              'placeholder-gray-500 dark:placeholder-gray-400'
            )}
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {filteredConversations.map((conversation, index) => {
            const userMessage = conversation.messages.find(m => m.role === 'user');
            const assistantMessage = conversation.messages.find(m => m.role === 'assistant');
            const isSelected = selectedConversation === conversation.date;

            return (
              <div
                key={`${conversation.date}-${index}`}
                className={cn(
                  'rounded-lg border p-4 cursor-pointer transition-all duration-200',
                  'hover:border-blue-300 dark:hover:border-blue-600',
                  'hover:shadow-md dark:hover:shadow-lg',
                  isSelected 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                )}
                onClick={() => setSelectedConversation(isSelected ? null : conversation.date)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Question Preview */}
                    {userMessage && (
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 mb-2">
                        {userMessage.content}
                      </p>
                    )}
                    
                    {/* Answer Preview */}
                    {assistantMessage && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
                        {assistantMessage.answer_html 
                          ? assistantMessage.answer_html.replace(/<[^>]*>/g, '').substring(0, 120) + '...'
                          : assistantMessage.content.substring(0, 120) + '...'
                        }
                      </p>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatTime(conversation.date)}</span>
                      {conversation.citationCount > 0 && (
                        <span className="flex items-center gap-1">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-4.5A3.375 3.375 0 002.25 11.25v2.625a3.375 3.375 0 003.375 3.375h5.25a3.375 3.375 0 003.375-3.375z" />
                          </svg>
                          {conversation.citationCount} citations
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportConversation(conversation);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Export conversation"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Share functionality
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Share conversation"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935 2.186l-9.566 5.314m0 0a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                      </svg>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}