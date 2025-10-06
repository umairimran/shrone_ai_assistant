'use client';

import React, { useMemo } from 'react';
import { UploadedDoc } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AnalyticsDashboardProps {
  documents: UploadedDoc[];
  className?: string;
}

interface DocumentAnalytics {
  totalDocuments: number;
  totalSize: number;
  averageSize: number;
  statusDistribution: Record<string, number>;
  sizeDistribution: {
    small: number; // < 5MB
    medium: number; // 5-20MB
    large: number; // > 20MB
  };
  typeDistribution: Record<string, number>;
  recentUploads: number; // Last 7 days (placeholder)
}

export function AnalyticsDashboard({ documents, className }: AnalyticsDashboardProps) {
  const analytics = useMemo((): DocumentAnalytics => {
    const totalDocuments = documents.length;
    const totalSize = documents.reduce((sum, doc) => sum + doc.sizeMB, 0);
    const averageSize = totalDocuments > 0 ? totalSize / totalDocuments : 0;

    // Status distribution
    const statusDistribution = documents.reduce((acc, doc) => {
      acc[doc.status] = (acc[doc.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Size distribution
    const sizeDistribution = documents.reduce(
      (acc, doc) => {
        if (doc.sizeMB < 5) acc.small++;
        else if (doc.sizeMB <= 20) acc.medium++;
        else acc.large++;
        return acc;
      },
      { small: 0, medium: 0, large: 0 }
    );

    // File type distribution (based on extension)
    const typeDistribution = documents.reduce((acc, doc) => {
      const extension = doc.name.split('.').pop()?.toLowerCase() || 'unknown';
      acc[extension] = (acc[extension] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalDocuments,
      totalSize,
      averageSize,
      statusDistribution,
      sizeDistribution,
      typeDistribution,
      recentUploads: totalDocuments // Placeholder - would need actual date tracking
    };
  }, [documents]);

  const formatSize = (sizeMB: number): string => {
    if (sizeMB < 1) return `${(sizeMB * 1024).toFixed(1)} KB`;
    if (sizeMB < 1024) return `${sizeMB.toFixed(1)} MB`;
    return `${(sizeMB / 1024).toFixed(1)} GB`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'uploading':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getTypeColor = (index: number) => {
    const colors = [
      'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
      'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
      'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    ];
    return colors[index % colors.length];
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Documents</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {analytics.totalDocuments.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-sm text-green-600 dark:text-green-400">
              {analytics.recentUploads} new this week
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Size</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {formatSize(analytics.totalSize)}
              </p>
            </div>
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <svg className="h-6 w-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
              </svg>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Avg: {formatSize(analytics.averageSize)}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Success Rate</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {analytics.totalDocuments > 0 
                  ? Math.round((analytics.statusDistribution.uploaded || 0) / analytics.totalDocuments * 100)
                  : 0}%
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {analytics.statusDistribution.uploaded || 0} successful uploads
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">File Types</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {Object.keys(analytics.typeDistribution).length}
              </p>
            </div>
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <svg className="h-6 w-6 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Most common: {Object.keys(analytics.typeDistribution)[0] || 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* Charts and Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Upload Status</h3>
          <div className="space-y-3">
            {Object.entries(analytics.statusDistribution).map(([status, count]) => {
              const percentage = analytics.totalDocuments > 0 ? (count / analytics.totalDocuments) * 100 : 0;
              return (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className={cn('px-2 py-1 text-xs font-medium rounded-full capitalize', getStatusColor(status))}>
                      {status}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">{count} documents</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={cn(
                          'h-2 rounded-full transition-all duration-300',
                          status === 'uploaded' ? 'bg-green-500' :
                          status === 'uploading' ? 'bg-blue-500' :
                          status === 'failed' ? 'bg-red-500' : 'bg-gray-500'
                        )}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 w-10 text-right">
                      {percentage.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Size Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">File Sizes</h3>
          <div className="space-y-3">
            {Object.entries(analytics.sizeDistribution).map(([sizeCategory, count]) => {
              const percentage = analytics.totalDocuments > 0 ? (count / analytics.totalDocuments) * 100 : 0;
              const sizeLabel = sizeCategory === 'small' ? '< 5MB' : sizeCategory === 'medium' ? '5-20MB' : '> 20MB';
              const colorClass = sizeCategory === 'small' ? 'bg-green-500' : sizeCategory === 'medium' ? 'bg-yellow-500' : 'bg-red-500';
              
              return (
                <div key={sizeCategory} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize w-16">
                      {sizeLabel}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">{count} documents</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={cn('h-2 rounded-full transition-all duration-300', colorClass)}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 w-10 text-right">
                      {percentage.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* File Types */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">File Types Distribution</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(analytics.typeDistribution)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10) // Show top 10 file types
            .map(([type, count], index) => {
              const percentage = analytics.totalDocuments > 0 ? (count / analytics.totalDocuments) * 100 : 0;
              return (
                <div
                  key={type}
                  className={cn(
                    'flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium',
                    getTypeColor(index)
                  )}
                >
                  <span className="uppercase">{type}</span>
                  <span className="bg-white bg-opacity-30 px-1.5 py-0.5 rounded text-xs">
                    {count}
                  </span>
                  <span className="text-xs opacity-75">
                    ({percentage.toFixed(0)}%)
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Storage Usage */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Storage Usage</h3>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {formatSize(analytics.totalSize)} used
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
            <div
              className="bg-gradient-to-r from-blue-500 to-purple-600 h-4 rounded-full transition-all duration-500"
              style={{ width: '45%' }} // Placeholder - would calculate based on storage limits
            />
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600 dark:text-gray-400">Documents:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {analytics.totalDocuments}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Average Size:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {formatSize(analytics.averageSize)}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Largest File:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {formatSize(Math.max(...documents.map(d => d.sizeMB), 0))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}