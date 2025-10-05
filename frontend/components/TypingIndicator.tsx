'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  visible: boolean;
}

export function TypingIndicator({ visible }: TypingIndicatorProps) {
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'mt-4 flex items-center gap-2 text-sm text-[#9aa3af]'
      )}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow-400/80 text-xs font-bold text-black/80 shadow">
        A
      </span>
      <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-[#101318] px-4 py-3 shadow-sm">
        <span>Assistant is typing</span>
        <span className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-[#e5e7eb] opacity-80 animate-typing-dot" />
          <span className="h-1 w-1 rounded-full bg-[#e5e7eb] opacity-60 animate-typing-dot [animation-delay:150ms]" />
          <span className="h-1 w-1 rounded-full bg-[#e5e7eb] opacity-40 animate-typing-dot [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  );
}
