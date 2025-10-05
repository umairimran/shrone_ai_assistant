'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useChat } from '@/context/ChatContext';

const PLACEHOLDER_TEXTS = [
  'Ask me anything about the document...',
  'What would you like to know?',
  'Type your question here...',
  'How can I help you today?',
  'Ask about any section or detail...',
  'Need clarification on something?',
  'What information are you looking for?'
];

export function ChatInput() {
  const { sendMessage, isAssistantTyping } = useChat();
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  // Rotate placeholder text every 3 seconds
  useEffect(() => {
    if (isFocused || value.length > 0) return;
    
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_TEXTS.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [isFocused, value]);

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
    <div className="sticky bottom-0 z-10 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-900 px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-3xl items-end gap-3">
        <div
          className={cn(
            'flex-1 flex items-end rounded-xl transition-shadow duration-200',
            'bg-white dark:bg-gray-800',
            isFocused 
              ? 'shadow-[0_0_0_3px_rgba(59,130,246,0.15)] dark:shadow-[0_0_0_3px_rgba(96,165,250,0.15)]'
              : 'shadow-[0_0_0_1px_rgba(229,231,235,1)] dark:shadow-[0_0_0_1px_rgba(55,65,81,1)]'
          )}
        >
          <div className="flex-1 px-4 py-3">
            <label htmlFor="chat-input" className="sr-only">
              Ask about the document
            </label>
            <textarea
              ref={textAreaRef}
              id="chat-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={isFocused && value.length === 0 ? '' : PLACEHOLDER_TEXTS[placeholderIndex]}
              className="max-h-36 w-full resize-none bg-transparent text-sm leading-relaxed text-gray-900 dark:text-gray-100 placeholder:text-gray-500 placeholder:transition-opacity placeholder:duration-300 outline-none"
              rows={1}
              aria-label="Message input"
              aria-describedby="input-help"
              disabled={isAssistantTyping}
            />
            <span id="input-help" className="sr-only">
              Press Enter to send message, Shift+Enter for new line
            </span>
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!value.trim() || isAssistantTyping}
            className={cn(
              'mr-2 mb-2 rounded-lg px-4 py-2 font-medium text-sm transition-all duration-200',
              'bg-blue-500 text-white',
              'hover:bg-blue-600',
              'active:bg-blue-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
            )}
            aria-label={isAssistantTyping ? 'Assistant is typing' : 'Send message'}
            title={isAssistantTyping ? 'Please wait...' : 'Send message (Enter)'}
          >
            {isAssistantTyping ? (
              <>
                <span className="sr-only">Assistant is thinking</span>
                <div className="flex items-center gap-2" aria-hidden="true">
                  <div className="animate-pulse">⏳</div>
                  <span>Thinking...</span>
                </div>
              </>
            ) : (
              <>
                <span className="sr-only">Send your message</span>
                <div className="flex items-center gap-2" aria-hidden="true">
                  <span>Send</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </div>
              </>
            )}
          </button>
        </div>
      </div>
      {value.length > 0 && (
        <div className="mx-auto mt-2 flex max-w-3xl justify-between px-2 text-xs text-gray-500">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <span className={cn(
            'transition-colors',
            value.length > 1000 && 'text-yellow-500',
            value.length > 2000 && 'text-red-500'
          )}>
            {value.length} characters
          </span>
        </div>
      )}
    </div>
  );
}
