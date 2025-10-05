'use client';

import React, { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useChat } from '@/context/ChatContext';

export function ChatInput() {
  const { sendMessage, isAssistantTyping } = useChat();
  const [value, setValue] = useState('');
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSend = useCallback(async () => {
    if (!value.trim()) return;
    await sendMessage(value);
    setValue('');
    textAreaRef.current?.focus();
  }, [sendMessage, value]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="border-t border-white/5 bg-[#0b0f13] px-3 py-4 sm:px-6">
      <div className="mx-auto flex max-w-3xl items-end">
        <div
          className={cn(
            'flex w-full items-center rounded-full border border-white/10 bg-[#0e1116] px-4 py-2 transition focus-within:border-white/20'
          )}
        >
          <label htmlFor="chat-input" className="sr-only">
            Ask about the document
          </label>
          <textarea
            ref={textAreaRef}
            id="chat-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask something about the document…"
            className="max-h-36 w-full resize-none bg-transparent text-sm text-[#e5e7eb] placeholder:text-white/40 outline-none"
            rows={1}
            aria-label="Ask about the document"
            disabled={isAssistantTyping}
          />
          <button
            type="button"
            onClick={handleSend}
            className="ml-2 rounded-full px-3 py-2 text-lg text-[#e5e7eb] transition hover:bg-white/10 disabled:opacity-40"
            aria-label="Send message"
            disabled={isAssistantTyping}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
