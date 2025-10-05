'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

function SkeletonBase({
  className,
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse'
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-gray-200 dark:bg-gray-700',
        animation === 'pulse' && 'animate-pulse',
        animation === 'wave' && 'animate-pulse', // Could implement wave animation
        variant === 'text' && 'rounded-sm h-4',
        variant === 'rectangular' && 'rounded-md',
        variant === 'circular' && 'rounded-full',
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
}

// Specialized skeleton components
export function MessageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <SkeletonBase variant="circular" className="w-7 h-7" />
      <div className="flex-1 space-y-2">
        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4 space-y-3">
          <SkeletonBase className="h-4 w-20" />
          <div className="space-y-2">
            <SkeletonBase className="h-4 w-full" />
            <SkeletonBase className="h-4 w-5/6" />
            <SkeletonBase className="h-4 w-4/5" />
          </div>
        </div>
        <SkeletonBase className="h-3 w-16" />
      </div>
    </div>
  );
}

export function CitationSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-gray-200 dark:border-gray-700 p-4', className)}>
      <div className="flex items-start gap-3 mb-3">
        <SkeletonBase variant="circular" className="w-6 h-6" />
        <div className="flex-1 space-y-2">
          <SkeletonBase className="h-4 w-3/4" />
          <SkeletonBase className="h-3 w-1/2" />
        </div>
      </div>
      <div className="space-y-2 mb-3">
        <SkeletonBase className="h-3 w-20" />
      </div>
      <div className="bg-gray-50 dark:bg-gray-800 rounded border-l-4 border-gray-300 dark:border-gray-600 p-3 mb-3">
        <SkeletonBase className="h-3 w-full mb-1" />
        <SkeletonBase className="h-3 w-4/5" />
      </div>
      <div className="flex items-center justify-between">
        <SkeletonBase className="h-8 w-24" />
        <SkeletonBase className="h-8 w-16" />
      </div>
    </div>
  );
}

export function DocumentListSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <SkeletonBase className="h-4 w-3/4" />
              <SkeletonBase className="h-3 w-1/4" />
              <div className="flex items-center gap-4">
                <SkeletonBase className="h-3 w-16" />
                <SkeletonBase className="h-3 w-20" />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <SkeletonBase className="h-8 w-8" />
              <SkeletonBase className="h-8 w-8" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConversationListSkeleton({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="space-y-3">
            <SkeletonBase className="h-4 w-5/6" />
            <SkeletonBase className="h-3 w-full" />
            <SkeletonBase className="h-3 w-4/5" />
            <div className="flex items-center gap-4 mt-3">
              <SkeletonBase className="h-3 w-16" />
              <SkeletonBase className="h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SidebarSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6 p-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <SkeletonBase variant="rectangular" className="w-9 h-9 rounded-md" />
        <div className="flex-1 space-y-2">
          <SkeletonBase className="h-4 w-32" />
          <SkeletonBase className="h-3 w-24" />
        </div>
      </div>

      {/* Category */}
      <div className="space-y-2">
        <SkeletonBase className="h-3 w-40" />
        <SkeletonBase className="h-10 w-full rounded-lg" />
      </div>

      {/* Document Management */}
      <div className="space-y-3">
        <SkeletonBase className="h-3 w-36" />
        <SkeletonBase className="h-24 w-full rounded-lg" />
      </div>

      {/* Document List */}
      <div className="space-y-3">
        <SkeletonBase className="h-3 w-32" />
        <DocumentListSkeleton count={2} />
      </div>
    </div>
  );
}

// Document Library Skeleton
export function DocumentLibrarySkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded-md mb-2 animate-pulse" />
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-20 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
          <div className="h-9 w-32 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
        </div>
      </div>

      {/* Search Filters */}
      <div className="space-y-4">
        <div className="h-11 w-full bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        <div className="flex items-center justify-between">
          <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
          <div className="h-8 w-40 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
        </div>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
            <div className="h-5 w-full bg-gray-200 dark:bg-gray-700 rounded mb-3 animate-pulse" />
            <div className="space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="flex justify-between">
                <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const Skeleton = {
  Message: MessageSkeleton,
  Citation: CitationSkeleton,
  DocumentList: DocumentListSkeleton,
  ConversationList: ConversationListSkeleton,
  Sidebar: SidebarSkeleton,
  DocumentLibrary: DocumentLibrarySkeleton,
  Default: SkeletonBase
};
