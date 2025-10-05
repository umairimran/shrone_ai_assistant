'use client';

import React, { useMemo, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ChatHeader } from '@/components/ChatHeader';
import { DocumentTag } from '@/components/DocumentTag';
import { MessageList } from '@/components/MessageList';
import { ChatInput } from '@/components/ChatInput';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { DocumentViewerIntegration } from '@/components/DocumentViewerIntegration';
import { ChatProvider, useChat } from '@/context/ChatContext';
import { DocumentViewerProvider } from '@/context/DocumentViewerContext';

function ChatPageContent() {
  const { documents, activeDocumentId, messages, isAssistantTyping, activeCategory } = useChat();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeDocumentName = useMemo(() => {
    const activeDoc = documents.find((doc) => doc.id === activeDocumentId);
    return activeDoc?.name ?? null;
  }, [activeDocumentId, documents]);

  return (
    <div className="relative min-h-screen bg-white dark:bg-zinc-900">
      <div className="min-h-screen lg:grid lg:grid-cols-[300px_1fr]">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-h-screen flex-col">
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-zinc-900/95 px-4 py-4 backdrop-blur lg:hidden">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Shrone</span>
            <ThemeToggle size="sm" />
          </div>
          <main className="flex h-full flex-1 flex-col">
            <section className="flex flex-1 flex-col px-4 pb-4 pt-6 sm:px-8">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                <ChatHeader />
                <DocumentTag name={activeDocumentName} category={activeCategory} />
              </div>
              <MessageList messages={messages} isAssistantTyping={isAssistantTyping} />
            </section>
            <ChatInput />
          </main>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <DocumentViewerProvider>
      <ChatProvider>
        <ChatPageContent />
        <DocumentViewerIntegration />
      </ChatProvider>
    </DocumentViewerProvider>
  );
}
