'use client';

import React, { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface FileDropZoneProps {
  onFiles: (_files: FileList | File[]) => void;
  disabled?: boolean;
  error?: boolean;
}

const ALLOWED_TYPES = {
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
};

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

export function FileDropZone({ onFiles, disabled, error }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const validateFiles = useCallback((files: FileList | null): { valid: boolean; error?: string } => {
    if (!files || files.length === 0) {
      return { valid: false, error: 'No files selected' };
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check file type
      if (!Object.keys(ALLOWED_TYPES).includes(file.type)) {
        return {
          valid: false,
          error: `Invalid file type: ${file.name}. Only PDF, TXT, DOC, and DOCX files are allowed.`
        };
      }
      
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        return {
          valid: false,
          error: `File too large: ${file.name} (${sizeMB}MB). Maximum size is 200MB.`
        };
      }
    }

    return { valid: true };
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || disabled) return;
      
      const validation = validateFiles(files);
      if (!validation.valid) {
        console.warn(validation.error || 'Invalid files');
        return;
      }
      
      onFiles(files);
    },
    [disabled, onFiles, validateFiles]
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
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={cn(
        'group relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-all duration-300',
        // Light mode styles
        'bg-white border-gray-300 shadow-sm',
        // Dark mode styles
        'dark:bg-gray-800 dark:border-gray-600',
        // Hover effects
        'hover:scale-[1.02] hover:shadow-md dark:hover:shadow-gray-900/50',
        // Dragging state
        isDragging && 'scale-[1.05] border-blue-500 bg-blue-50 dark:bg-blue-950/50 shadow-2xl ring-4 ring-blue-500/20',
        // Disabled state
        disabled && 'opacity-50 cursor-not-allowed hover:scale-100',
        // Error state
        error && 'border-red-500 bg-red-50 dark:bg-red-950/50'
      )}
    >
      {/* Upload Icon */}
      <div className={cn(
        'flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300',
        'bg-gray-100 dark:bg-gray-700',
        isDragging && 'bg-blue-100 dark:bg-blue-900/50 scale-110',
        error && 'bg-red-100 dark:bg-red-900/50'
      )}>
        <svg 
          className={cn(
            'h-6 w-6 transition-all duration-300',
            'text-gray-600 dark:text-gray-300',
            isDragging && 'text-blue-600 dark:text-blue-400 scale-110',
            error && 'text-red-600 dark:text-red-400'
          )} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
          />
        </svg>
      </div>

      {/* Main Text */}
      <div className="flex flex-col items-center justify-center space-y-0.5">
        <p className={cn(
          'text-xs font-medium transition-colors',
          'text-gray-900 dark:text-gray-100',
          isDragging && 'text-blue-600 dark:text-blue-400'
        )}>
          {isDragging ? 'Drop files here' : 'Drag and drop files here'}
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          or click to browse
        </p>
      </div>

      {/* File Info */}
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-0.5">
          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          PDF, TXT, DOC, DOCX
        </span>
        <span className="text-[8px]">•</span>
        <span>Max 200MB</span>
      </div>

      {/* Browse Button */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className={cn(
          'mt-1 rounded-md px-4 py-1.5 text-xs font-medium transition-all duration-200',
          'bg-blue-500 text-white',
          'hover:bg-blue-600 hover:shadow-lg hover:scale-105',
          'active:scale-95',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 dark:focus:ring-offset-gray-800',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100'
        )}
        aria-label="Browse files"
      >
        Browse Files
      </button>

      {/* Hidden File Input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.doc,.docx,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
        disabled={disabled}
      />

      {/* Glow Effect on Drag */}
      {isDragging && (
        <div className="absolute inset-0 rounded-xl bg-blue-500/10 dark:bg-blue-400/10 animate-pulse pointer-events-none" />
      )}
    </div>
  );
}
