'use client';

import React, { useState } from 'react';
import { ChatMessage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { ExportService, ExportOptions } from '@/services/exportService';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  title?: string;
}

export function ExportModal({ isOpen, onClose, messages, title = 'Conversation' }: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'html' | 'json' | 'markdown'>('pdf');
  const [includeCitations, setIncludeCitations] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [customTitle, setCustomTitle] = useState(title);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      const options: Partial<ExportOptions> = {
        format: selectedFormat,
        includeCitations,
        includeMetadata,
        title: customTitle
      };

      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const baseFilename = `${customTitle}-${timestamp}`;

      switch (selectedFormat) {
        case 'pdf': {
          const blob = await ExportService.exportToPDF(messages, options);
          ExportService.downloadFile(blob, `${baseFilename}.pdf`, 'application/pdf');
          break;
        }
        case 'html': {
          const html = ExportService.exportToHTML(messages, options);
          ExportService.downloadFile(html, `${baseFilename}.html`, 'text/html');
          break;
        }
        case 'json': {
          const json = ExportService.exportToJSON(messages, options);
          ExportService.downloadFile(json, `${baseFilename}.json`, 'application/json');
          break;
        }
        case 'markdown': {
          const markdown = ExportService.exportToMarkdown(messages, options);
          ExportService.downloadFile(markdown, `${baseFilename}.md`, 'text/markdown');
          break;
        }
      }

      onClose();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const formatOptions = [
    { value: 'pdf', label: 'PDF', description: 'Formatted document for printing and sharing' },
    { value: 'html', label: 'HTML', description: 'Web page format for browsers' },
    { value: 'json', label: 'JSON', description: 'Structured data for developers' },
    { value: 'markdown', label: 'Markdown', description: 'Text format for documentation' }
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Export Conversation
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Export Title
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className={cn(
                'w-full px-3 py-2 border border-gray-300 rounded-md',
                'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                'dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100'
              )}
              placeholder="Enter export title..."
            />
          </div>

          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Export Format
            </label>
            <div className="space-y-2">
              {formatOptions.map((format) => (
                <label
                  key={format.value}
                  className={cn(
                    'flex items-start p-3 border rounded-lg cursor-pointer transition-colors',
                    selectedFormat === format.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  )}
                >
                  <input
                    type="radio"
                    name="format"
                    value={format.value}
                    checked={selectedFormat === format.value}
                    onChange={(e) => setSelectedFormat(e.target.value as any)}
                    className="mt-1 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="ml-3">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {format.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {format.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Export Options
            </label>
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeCitations}
                  onChange={(e) => setIncludeCitations(e.target.checked)}
                  className="text-blue-600 focus:ring-blue-500 rounded"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Include citations
                </span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeMetadata}
                  onChange={(e) => setIncludeMetadata(e.target.checked)}
                  className="text-blue-600 focus:ring-blue-500 rounded"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Include timestamps and metadata
                </span>
              </label>
            </div>
          </div>

          {/* Preview Info */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p className="font-medium mb-1">Export Preview:</p>
              <p>• Messages: {messages.length}</p>
              <p>• Citations: {messages.reduce((acc, m) => acc + (m.citations?.length || 0), 0)}</p>
              <p>• Format: {formatOptions.find(f => f.value === selectedFormat)?.label}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            loading={isExporting}
            disabled={!customTitle.trim()}
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </div>
      </div>
    </div>
  );
}