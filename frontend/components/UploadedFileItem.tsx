'use client';

import React from 'react';
import { UploadedDoc } from '@/lib/types';
import { cn, formatFileSize } from '@/lib/utils';

interface UploadedFileItemProps {
  doc: UploadedDoc;
  onDelete: (id: string) => void;
  onSelect?: (id: string) => void;
  isActive?: boolean;
}

export function UploadedFileItem({ doc, onDelete, onSelect, isActive }: UploadedFileItemProps) {
  const handleSelect = () => {
    if (!onSelect) return;
    onSelect(doc.id);
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-white/5 bg-[#10141a] p-3 text-sm text-[#e5e7eb] shadow-sm transition',
        onSelect && 'cursor-pointer hover:border-blue-500/60 hover:bg-blue-900/10',
        isActive && 'border-blue-500/60 bg-blue-900/10'
      )}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? isActive : undefined}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (!onSelect) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSelect();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium truncate" title={doc.name}>
            {doc.name}
          </p>
          <p className="text-xs text-[#9aa3af]">{formatFileSize(doc.sizeMB)}</p>
        </div>
        <button
          type="button"
          className="ml-2 h-6 w-6 rounded-full border border-white/10 text-center text-xs leading-6 text-[#e5e7eb] transition hover:border-red-500/60 hover:text-red-400"
          aria-label={`Delete ${doc.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(doc.id);
          }}
        >
          ✕
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-[#9aa3af]">
        <span className="capitalize">{doc.status}</span>
        {doc.status === 'uploading' && <span>{Math.round(doc.progress ?? 0)}%</span>}
      </div>
      {doc.status === 'uploading' && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn('h-full rounded-full bg-blue-500 transition-all duration-200')}
            style={{ width: `${Math.min(100, doc.progress ?? 0)}%` }}
          />
        </div>
      )}
      {doc.status === 'failed' && (
        <p className="mt-2 text-xs text-red-400">Upload failed. Try again.</p>
      )}
    </div>
  );
}
