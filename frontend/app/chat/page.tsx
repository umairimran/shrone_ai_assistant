'use client';

import React, { useMemo, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ChatHeader } from '@/components/ChatHeader';
import { DocumentTag } from '@/components/DocumentTag';
import { MessageList } from '@/components/MessageList';
import { ChatInput } from '@/components/ChatInput';
import { ChatProvider, useChat } from '@/context/ChatContext';

function ToastBanner() {
  const { toast, clearToast } = useChat();

  if (!toast) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 w-[90%] max-w-md -translate-x-1/2 rounded-xl border border-white/10 bg-[#151a21] px-4 py-3 text-sm text-[#e5e7eb] shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <span>{toast.message}</span>
        <button
          type="button"
          onClick={clearToast}
          className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-[#9aa3af] transition hover:border-white/40 hover:text-[#e5e7eb]"
          aria-label="Dismiss notification"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function ChatPageContent() {
  const { documents, activeDocumentId, messages, isAssistantTyping, activeCategory } = useChat();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeDocumentName = useMemo(() => {
    const activeDoc = documents.find((doc) => doc.id === activeDocumentId);
    return activeDoc?.name ?? null;
  }, [activeDocumentId, documents]);

  return (
    <div className="relative min-h-screen bg-[#0b0f13] text-[#e5e7eb]">
      <div className="min-h-screen lg:grid lg:grid-cols-[300px_1fr]">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-h-screen flex-col">
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/5 bg-[#0b0f13]/95 px-4 py-4 backdrop-blur lg:hidden">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-lg text-[#e5e7eb]"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              ☰
            </button>
            <span className="text-sm font-semibold text-[#9aa3af]">Shrone Chatbot</span>
            <div className="h-9 w-9" aria-hidden />
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
      <ToastBanner />
    </div>
  );
}

export default function ChatPage() {
  return (
    <ChatProvider>
      <ChatPageContent />
    </ChatProvider>
  );
}
