'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CreateYearData, DocumentCategory } from '@/lib/types';

interface CreateYearModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateYearData) => Promise<void>;
  categoryId: string | null;
  categories: DocumentCategory[];
  className?: string;
}

export function CreateYearModal({
  isOpen,
  onClose,
  onCreate,
  categoryId,
  categories,
  className
}: CreateYearModalProps) {
  const [formData, setFormData] = useState({
    categoryId: categoryId || '',
    year: new Date().getFullYear().toString()
  });
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update category when prop changes
  React.useEffect(() => {
    if (categoryId) {
      setFormData(prev => ({ ...prev, categoryId }));
    }
  }, [categoryId]);

  const resetForm = useCallback(() => {
    setFormData({
      categoryId: categoryId || '',
      year: new Date().getFullYear().toString()
    });
    setError(null);
  }, [categoryId]);

  const handleClose = useCallback(() => {
    if (!isCreating) {
      resetForm();
      onClose();
    }
  }, [isCreating, resetForm, onClose]);

  const handleInputChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  }, []);

  const validateForm = useCallback((): string | null => {
    if (!formData.categoryId) return 'Please select a category';
    if (!formData.year.trim()) return 'Year is required';
    
    const year = parseInt(formData.year);
    if (isNaN(year)) return 'Year must be a valid number';
    if (year < 1900) return 'Year must be 1900 or later';
    if (year > new Date().getFullYear() + 10) return 'Year cannot be more than 10 years in the future';
    
    return null;
  }, [formData]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await onCreate({
        categoryId: formData.categoryId,
        year: formData.year.trim()
      });
      resetForm();
    } catch (error) {
      console.error('Year creation error:', error);
      setError('Failed to create year folder. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }, [formData, validateForm, onCreate, resetForm]);

  const selectedCategory = categories.find(cat => cat.id === formData.categoryId);

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
              Create Year Folder
              {selectedCategory && (
                <span className="ml-2 text-sm font-normal text-blue-600 dark:text-blue-400">
                  in {selectedCategory.name}
                </span>
              )}
            </h2>
            <button
              onClick={handleClose}
              disabled={isCreating}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.categoryId}
                onChange={(e) => handleInputChange('categoryId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isCreating || !!categoryId}
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {categoryId && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Category is pre-selected for this folder creation
                </p>
              )}
            </div>

            {/* Year Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Year <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1900"
                max={new Date().getFullYear() + 10}
                value={formData.year}
                onChange={(e) => handleInputChange('year', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                placeholder="Enter year (e.g., 2024)"
                disabled={isCreating}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Year folders help organize documents by when they were issued
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
                disabled={isCreating}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </div>
                ) : (
                  'Create Year Folder'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}