import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function for merging Tailwind CSS classes
 * Combines clsx for conditional classes and tailwind-merge for handling Tailwind conflicts
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format timestamp to human-readable time
 */
export function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    return 'Invalid time';
  }
}

/**
 * Format file size from MB to human readable format
 */
export function formatFileSize(sizeMB: number): string {
  if (sizeMB === 0) {
    return 'PDF'; // Just show PDF for documents where size is not available
  }
  if (sizeMB < 0.1) {
    return `${Math.round(sizeMB * 1024)} KB`;
  }
  return `${sizeMB.toFixed(1)} MB`;
}

/**
 * Convert bytes to MB
 */
export function toMB(bytes: number): number {
  return bytes / (1024 * 1024);
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get document type from file
 */
export function getDocTypeFromFile(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  switch (extension) {
    case 'pdf':
      return 'pdf';
    case 'doc':
    case 'docx':
      return 'word';
    case 'txt':
      return 'text';
    case 'xls':
    case 'xlsx':
      return 'excel';
    case 'ppt':
    case 'pptx':
      return 'powerpoint';
    default:
      return 'unknown';
  }
}

/**
 * Generate a UUID compatible with all environments
 */
export function generateUUID(): string {
  // Check if native crypto.randomUUID is available
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  
  // Fallback implementation for browsers without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}