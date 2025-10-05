'use client';

import React, { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface FileDropZoneProps {
  onFiles: (files: FileList | File[]) => void;
  disabled?: boolean;
  error?: boolean;
}

export function FileDropZone({ onFiles, disabled, error }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || disabled) return;
      onFiles(files);
    },
    [disabled, onFiles]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      handleFiles(event.dataTransfer.files);
    },
    [disabled, handleFiles]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="space-y-3">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-white/10 bg-[#0f141a] px-4 py-8 text-center transition',
          isDragging && 'border-blue-500/60 bg-blue-900/10',
          disabled && 'opacity-50',
          error && 'border-red-500/60'
        )}
      >
        <p className="text-sm font-medium text-[#e5e7eb]">Drag and drop files here</p>
        <p className="text-xs text-[#9aa3af]">
          Limit 200MB per file · PDF, TXT, DOC, DOCX
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-[#e5e7eb] transition hover:border-white/30 hover:bg-white/10"
          aria-label="Browse files"
          disabled={disabled}
        >
          Browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>
    </div>
  );
}
