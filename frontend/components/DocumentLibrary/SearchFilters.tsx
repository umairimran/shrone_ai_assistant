'use client';

import React, { useState, useMemo } from 'react';
import { UploadedDoc } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import Fuse from 'fuse.js';

interface SearchFiltersProps {
  documents: UploadedDoc[];
  onFilteredDocuments: (documents: UploadedDoc[]) => void;
  categories?: string[];
  className?: string;
}

interface FilterState {
  searchQuery: string;
  selectedCategories: string[];
  selectedStatuses: string[];
  sortBy: 'name' | 'date' | 'size' | 'status';
  sortOrder: 'asc' | 'desc';
  dateRange: 'all' | 'today' | 'week' | 'month';
}

export function SearchFilters({
  documents,
  onFilteredDocuments,
  categories = [
    'Board & Committee Proceedings',
    'Bylaws & Governance Policies',
    'External Advocacy & Communications',
    'Policy & Position Statements',
    'Resolutions'
  ],
  className
}: SearchFiltersProps) {
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    selectedCategories: [],
    selectedStatuses: [],
    sortBy: 'name',
    sortOrder: 'asc',
    dateRange: 'all'
  });

  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [savedQueries, setSavedQueries] = useState<string[]>([]);

  // Configure Fuse.js for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(documents, {
      keys: ['name'],
      threshold: 0.3, // Fuzzy search threshold
      includeScore: true
    });
  }, [documents]);

  // Apply filters and sorting
  const filteredDocuments = useMemo(() => {
    let result = documents;

    // Text search
    if (filters.searchQuery.trim()) {
      const searchResults = fuse.search(filters.searchQuery);
      result = searchResults.map(r => r.item);
    }

    // Category filter
    if (filters.selectedCategories.length > 0) {
      // Since we don't have category in UploadedDoc, this would need to be enhanced
      // For now, we'll filter based on name patterns
      result = result.filter(doc =>
        filters.selectedCategories.some(cat => 
          doc.name.toLowerCase().includes(cat.toLowerCase())
        )
      );
    }

    // Status filter
    if (filters.selectedStatuses.length > 0) {
      result = result.filter(doc => filters.selectedStatuses.includes(doc.status));
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      const now = new Date();
      const _dateThresholds = {
        today: new Date(now.setHours(0, 0, 0, 0)),
        week: new Date(now.setDate(now.getDate() - 7)),
        month: new Date(now.setMonth(now.getMonth() - 1))
      };

      // Note: UploadedDoc doesn't have upload date, would need to be added
      // For now, this is a placeholder
    }

    // Sorting
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (filters.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.sizeMB - b.sizeMB;
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'date':
          // Would need upload date field
          comparison = 0;
          break;
      }

      return filters.sortOrder === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [documents, filters, fuse]);

  // Update filtered documents when results change
  React.useEffect(() => {
    onFilteredDocuments(filteredDocuments);
  }, [filteredDocuments, onFilteredDocuments]);

  const updateFilter = (key: keyof FilterState, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleCategory = (category: string) => {
    const updated = filters.selectedCategories.includes(category)
      ? filters.selectedCategories.filter(c => c !== category)
      : [...filters.selectedCategories, category];
    updateFilter('selectedCategories', updated);
  };

  const toggleStatus = (status: string) => {
    const updated = filters.selectedStatuses.includes(status)
      ? filters.selectedStatuses.filter(s => s !== status)
      : [...filters.selectedStatuses, status];
    updateFilter('selectedStatuses', updated);
  };

  const clearAllFilters = () => {
    setFilters({
      searchQuery: '',
      selectedCategories: [],
      selectedStatuses: [],
      sortBy: 'name',
      sortOrder: 'asc',
      dateRange: 'all'
    });
  };

  const saveCurrentQuery = () => {
    if (filters.searchQuery.trim() && !savedQueries.includes(filters.searchQuery)) {
      setSavedQueries(prev => [filters.searchQuery, ...prev].slice(0, 5)); // Keep only 5 recent queries
    }
  };

  const hasActiveFilters = filters.selectedCategories.length > 0 || 
                          filters.selectedStatuses.length > 0 || 
                          filters.dateRange !== 'all' ||
                          filters.searchQuery.trim().length > 0;

  const statuses = ['uploading', 'uploaded', 'failed'];

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search Bar */}
      <div className="relative">
        <svg 
          className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" 
          fill="none" 
          viewBox="0 0 24 24" 
          strokeWidth={2} 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        
        <input
          type="text"
          placeholder="Search documents..."
          value={filters.searchQuery}
          onChange={(e) => updateFilter('searchQuery', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              saveCurrentQuery();
            }
          }}
          className={cn(
            'w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg',
            'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
            'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100',
            'placeholder-gray-500 dark:placeholder-gray-400'
          )}
        />

        {/* Clear search */}
        {filters.searchQuery && (
          <button
            onClick={() => updateFilter('searchQuery', '')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Saved Queries */}
      {savedQueries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {savedQueries.map((query, index) => (
            <button
              key={index}
              onClick={() => updateFilter('searchQuery', query)}
              className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {query}
            </button>
          ))}
        </div>
      )}

      {/* Filter Toggle */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsFilterExpanded(!isFilterExpanded)}
          className="text-gray-600 dark:text-gray-400"
          rightIcon={
            <svg 
              className={cn('h-4 w-4 transition-transform', isFilterExpanded ? 'rotate-180' : '')} 
              fill="none" 
              viewBox="0 0 24 24" 
              strokeWidth={2} 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          }
        >
          Filters {hasActiveFilters && `(${
            filters.selectedCategories.length + 
            filters.selectedStatuses.length + 
            (filters.dateRange !== 'all' ? 1 : 0) +
            (filters.searchQuery.trim() ? 1 : 0)
          })`}
        </Button>

        <div className="flex items-center gap-2">
          {/* Sort Options */}
          <select
            value={`${filters.sortBy}-${filters.sortOrder}`}
            onChange={(e) => {
              const [sortBy, sortOrder] = e.target.value.split('-') as [FilterState['sortBy'], FilterState['sortOrder']];
              updateFilter('sortBy', sortBy);
              updateFilter('sortOrder', sortOrder);
            }}
            className={cn(
              'text-sm border border-gray-300 rounded-md px-3 py-1.5',
              'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
            )}
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="size-asc">Size (Smallest)</option>
            <option value="size-desc">Size (Largest)</option>
            <option value="status-asc">Status (A-Z)</option>
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
          </select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-gray-500 hover:text-gray-700"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Advanced Filters */}
      {isFilterExpanded && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-4">
          {/* Categories */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Categories</h4>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-full border transition-colors',
                    filters.selectedCategories.includes(category)
                      ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'
                  )}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</h4>
            <div className="flex flex-wrap gap-2">
              {statuses.map((status) => (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-full border transition-colors capitalize',
                    filters.selectedStatuses.includes(status)
                      ? 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-600 dark:text-green-300'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Upload Date</h4>
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'All Time' },
                { value: 'today', label: 'Today' },
                { value: 'week', label: 'This Week' },
                { value: 'month', label: 'This Month' }
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => updateFilter('dateRange', value)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-full border transition-colors',
                    filters.dateRange === value
                      ? 'bg-purple-100 border-purple-300 text-purple-700 dark:bg-purple-900/30 dark:border-purple-600 dark:text-purple-300'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results Summary */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        Showing {filteredDocuments.length} of {documents.length} documents
        {hasActiveFilters && ' (filtered)'}
      </div>
    </div>
  );
}