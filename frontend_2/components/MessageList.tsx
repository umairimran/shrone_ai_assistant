'use client';

import React from 'react';
import { ChatMessage } from '@/lib/types';
import { MessageItem } from '@/components/MessageItem';
import { ScrollAnchor } from '@/components/ScrollAnchor';
import { TypingIndicator } from '@/components/TypingIndicator';

interface MessageListProps {
  messages: ChatMessage[];
  isAssistantTyping: boolean;
}

export function MessageList({ messages, isAssistantTyping }: MessageListProps) {
  return (
    <div
      className="scrollbar-thin flex-1 overflow-y-auto px-2 py-6 sm:px-6"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-4xl lg:max-w-5xl xl:max-w-6xl flex-col gap-6">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
        <TypingIndicator visible={isAssistantTyping} />
        <ScrollAnchor dependencies={[messages.length, isAssistantTyping]} />
      </div>
    </div>
  );
}
