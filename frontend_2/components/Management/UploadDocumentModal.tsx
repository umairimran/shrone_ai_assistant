'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { DocumentCategory, DocumentUploadData } from '@/lib/types';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (_data: DocumentUploadData) => Promise<'ok' | 'invalid' | 'failed'>;
  categories: DocumentCategory[];
  selectedCategoryId?: string | null;
  selectedYear?: string | null;
  existingTitle?: string | null;
  isNewVersion?: boolean;
  className?: string;
}

export function UploadDocumentModal({
  isOpen,
  onClose,
  onUpload,
  categories,
  selectedCategoryId,
  selectedYear,
  existingTitle,
  isNewVersion = false,
  className
}: UploadDocumentModalProps) {
  // Find the selected category name from the ID
  const selectedCategory = selectedCategoryId 
    ? categories.find(cat => cat.id === selectedCategoryId)
    : null;
  
  const [formData, setFormData] = useState({
    title: existingTitle || '',
    version: '',
    category: selectedCategory?.name || '',
    year: selectedYear || new Date().getFullYear().toString()
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update form when selectedCategoryId or existingTitle changes
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      title: existingTitle || prev.title,
      category: selectedCategory?.name || '',
      year: selectedYear || prev.year
    }));
  }, [selectedCategory, existingTitle]);

  const resetForm = useCallback(() => {
    setFormData({
      title: '',
      version: '',
      category: selectedCategory?.name || '',
      year: selectedYear || new Date().getFullYear().toString()
    });
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [selectedCategory, selectedYear]);

  const handleClose = useCallback(() => {
    if (!isUploading) {
      resetForm();
      onClose();
    }
  }, [isUploading, resetForm, onClose]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!formData.title) {
        // Auto-populate title from filename (without extension)
        const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, '');
        setFormData(prev => ({ ...prev, title: nameWithoutExtension }));
      }
      setError(null);
    }
  }, [formData.title]);

  const handleInputChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  }, []);

  const validateForm = useCallback((): string | null => {
    if (!formData.title.trim()) return 'Title is required';
    if (!formData.version.trim()) return 'Version is required';
    if (!formData.category) return 'Category is required';
    if (!formData.year.trim()) return 'Year is required';
    if (!selectedFile) return 'Please select a file';
    
    // Validate year
    const year = parseInt(formData.year);
    if (isNaN(year) || year < 1970 || year > 2030) {
      return 'Year must be between 1970 and 2030';
    }
    
    // Validate file size (50MB limit as per backend)
    const sizeMB = selectedFile.size / (1024 * 1024);
    if (sizeMB > 50) return 'File size must be less than 50MB';
    
    // Validate file type (as per backend supported extensions)
    const allowedTypes = ['.pdf', '.docx', '.txt', '.md'];
    const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
    if (!allowedTypes.includes(fileExtension)) {
      return 'Only PDF, DOCX, TXT, and MD files are allowed';
    }
    
    return null;
  }, [formData, selectedFile]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      console.error('❌ Validation error:', validationError);
      setError(validationError);
      return;
    }

    if (!selectedFile) {
      console.error('❌ No file selected');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Use the year from form data for the metadata
      const issueDate = `${formData.year}-01-01`; // Set to January 1st of the selected year
      
      const uploadData: DocumentUploadData = {
        title: formData.title.trim(),
        version: formData.version.trim(),
        issueDate: issueDate,
        category: formData.category,
        year: formData.year,
        file: selectedFile
      };

      const result = await onUpload(uploadData);

      if (result === 'ok') {
        resetForm();
        onClose();
      } else if (result === 'invalid') {
        console.error('❌ Upload validation failed');
        setError('Invalid file type or size. Please check your file.');
      } else {
        console.error('❌ Upload failed with result:', result);
        setError('Upload failed. Please check the console for detailed error information. Make sure the backend server is running and accessible.');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setError('Upload failed. Backend server may not be running. Check console for details.');
    } finally {
      setIsUploading(false);
    }
  }, [formData, selectedFile, validateForm, onUpload, resetForm, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={handleClose}
        />
        
        {/* Modal */}
        <div className={cn(
          'relative bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md p-6',
          className
        )}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Upload Document
              {selectedCategory && (
                <span className="ml-2 text-sm font-normal text-blue-600 dark:text-blue-400">
                  to {selectedCategory.name}
                </span>
              )}
            </h2>
            <button
              onClick={handleClose}
              disabled={isUploading}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Title <span className="text-red-500">*</span>
                {isNewVersion && <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(New Version)</span>}
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                className={cn(
                  "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white",
                  isNewVersion && "bg-gray-100 dark:bg-gray-700 cursor-not-allowed"
                )}
                placeholder="Enter document title"
                disabled={isUploading || isNewVersion}
                readOnly={isNewVersion}
              />
              {isNewVersion && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Title is locked when uploading a new version
                </p>
              )}
            </div>

            {/* Version */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Version <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.version}
                onChange={(e) => handleInputChange('version', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                placeholder="e.g., 1.0, v2.1, Rev A"
                disabled={isUploading}
              />
            </div>

            {/* Year */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Year <span className="text-red-500">*</span>
                {selectedYear && <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(From folder: {selectedYear})</span>}
              </label>
              <input
                type="number"
                value={formData.year}
                onChange={(e) => handleInputChange('year', e.target.value)}
                className={cn(
                  "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white",
                  selectedYear && "bg-gray-100 dark:bg-gray-700 cursor-not-allowed"
                )}
                placeholder="e.g., 2024"
                min="1970"
                max="2030"
                disabled={isUploading || !!selectedYear}
                readOnly={!!selectedYear}
              />
              {selectedYear && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Year is automatically set from the selected folder
                </p>
              )}
            </div>

            {/* Category */}
            {/** Category selection hidden. `formData.category` is set from the selected node and used internally. **/}

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Document File <span className="text-red-500">*</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.docx,.txt,.md"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300"
                disabled={isUploading}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Supported formats: PDF, DOCX, TXT, MD (max 50MB)
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
                {error}
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={isUploading}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Uploading...
                  </div>
                ) : (
                  'Upload Document'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}