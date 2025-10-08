'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useEnhancedChat } from '@/context/EnhancedChatContext';

export function ChatInput() {
  const { sendMessage, isAssistantTyping } = useEnhancedChat();
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textAreaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set height to scrollHeight, but cap it at max height (144px = max-h-36)
    const maxHeight = 144;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, []);

  // Adjust height when value changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [value, adjustTextareaHeight]);

  const handleSend = useCallback(async () => {
    if (!value.trim()) return;
    await sendMessage(value);
    setValue('');
    // Reset textarea height after sending
    if (textAreaRef.current) {
      textAreaRef.current.style.height = 'auto';
    }
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

  const handleChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
  }, []);

  const handleContainerClick = useCallback(() => {
    textAreaRef.current?.focus();
  }, []);

  return (
    <div className="sticky bottom-0 z-10 bg-white dark:bg-zinc-900 px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-4xl lg:max-w-5xl xl:max-w-6xl items-end gap-3">
        <div
          className={cn(
            'flex-1 flex items-end rounded-xl transition-shadow duration-200 cursor-text',
            'bg-white dark:bg-gray-800',
            isFocused 
              ? 'shadow-[0_0_0_3px_rgba(59,130,246,0.15)] dark:shadow-[0_0_0_3px_rgba(96,165,250,0.15)]'
              : 'shadow-[0_0_0_1px_rgba(229,231,235,1)] dark:shadow-[0_0_0_1px_rgba(55,65,81,1)]'
          )}
          onClick={handleContainerClick}
        >
          <div className="flex-1 px-4 py-3">
            <label htmlFor="chat-input" className="sr-only">
              Ask about the document
            </label>
            <textarea
              ref={textAreaRef}
              id="chat-input"
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Press Enter to send"
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-gray-900 dark:text-gray-100 placeholder:text-gray-500 outline-none min-h-[24px]"
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
    </div>
  );
}
