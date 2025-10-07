'use client';

import React, { useMemo, useState } from 'react';
import { ConversationSidebar } from '@/components/Chat/ConversationSidebar';
import { NewChatButton } from '@/components/Chat/NewChatButton';
import { ChatHeader } from '@/components/ChatHeader';
import { DocumentTag } from '@/components/DocumentTag';
import { MessageList } from '@/components/MessageList';
import { ChatInput } from '@/components/ChatInput';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { DocumentViewerIntegration } from '@/components/DocumentViewerIntegration';
import { EnhancedChatProvider, useEnhancedChat } from '@/context/EnhancedChatContext';
import { DocumentViewerProvider } from '@/context/DocumentViewerContext';

function EnhancedChatPageContent() {
  const {
    documents,
    activeDocumentId,
    messages,
    isAssistantTyping,
    activeCategory,
    conversations,
    currentConversationId,
    isLoadingConversations,
    startNewConversation,
    loadConversation,
    deleteConversation,
    renameConversation
  } = useEnhancedChat();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeDocumentName = useMemo(() => {
    const activeDoc = documents.find((doc) => doc.id === activeDocumentId);
    return activeDoc?.name ?? null;
  }, [activeDocumentId, documents]);

  const hasMessages = messages.length > 0;

  return (
    <div className="relative min-h-screen bg-white dark:bg-zinc-900">
      <div className="min-h-screen lg:grid lg:grid-cols-[320px_1fr]">
        {/* Enhanced Conversation Sidebar */}
        <ConversationSidebar
          onNewChat={startNewConversation}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          hasMessages={hasMessages}
        />

        {/* Main Chat Area */}
        <div className="flex min-h-screen flex-col">
          {/* Mobile Header */}
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-zinc-900/95 px-4 py-4 backdrop-blur lg:hidden">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open conversation history"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sharon</span>
              <NewChatButton
                onNewChat={startNewConversation}
                hasMessages={hasMessages}
                variant="ghost"
                size="sm"
                showConfirmation={false}
              />
            </div>
            
            <ThemeToggle size="sm" />
          </div>

          {/* Chat Content */}
          <main className="flex h-full flex-1 flex-col">
            <section className="flex flex-1 flex-col px-4 pb-4 pt-6 sm:px-8">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                {/* Chat Header with New Chat Button */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <ChatHeader />
                    <DocumentTag name={activeDocumentName} category={activeCategory} />
                  </div>
                  <div className="hidden lg:flex flex-shrink-0">
                    <NewChatButton
                      onNewChat={startNewConversation}
                      hasMessages={hasMessages}
                      variant="secondary"
                      size="sm"
                      showConfirmation={false}
                    />
                  </div>
                </div>

                {/* Conversation Info */}
                {currentConversationId && conversations.length > 0 && (
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span>
                        Current conversation • {messages.length} message{messages.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Messages */}
              <MessageList messages={messages} isAssistantTyping={isAssistantTyping} />

              {/* Empty State for New Conversation */}
              {messages.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md mx-auto px-4">
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                      <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Start a New Conversation
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      Ask me anything about your documents. I'm here to help you find information, analyze content, and answer your questions.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center text-sm">
                      <span className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                        Document Analysis
                      </span>
                      <span className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                        Q&A
                      </span>
                      <span className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                        Information Extraction
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Chat Input */}
            <ChatInput />
          </main>
        </div>
      </div>
    </div>
  );
}

export default function EnhancedChatPage() {
  return (
    <DocumentViewerProvider>
      <EnhancedChatProvider>
        <EnhancedChatPageContent />
        <DocumentViewerIntegration />
      </EnhancedChatProvider>
    </DocumentViewerProvider>
  );
}