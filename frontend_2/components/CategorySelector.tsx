'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useEnhancedChat } from '@/context/EnhancedChatContext';

const categories = [
  'All Categories',
  'Board and Committee Proceedings',
  'Bylaws & Governance Policies',
  'External Advocacy &  Communications',
  'Policy & Position Statements',
  'Resolutions'
];

export function CategorySelector() {
  const { activeCategory, setActiveCategory } = useEnhancedChat();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <div className="relative w-full max-w-md" ref={dropdownRef}>
      <label htmlFor="category-selector" className="sr-only">
        Select document category
      </label>
      
      {/* Dropdown Button */}
      <button
        id="category-selector"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-2 text-left',
          'bg-blue-600 hover:bg-blue-700 border border-blue-600 rounded-lg',
          'text-white text-sm font-medium shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
          'transition-all duration-200'
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="truncate">{activeCategory}</span>
        </div>
        <svg 
          className={cn(
            'w-4 h-4 text-white flex-shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div 
          className={cn(
            'absolute z-50 mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700',
            'bg-white dark:bg-gray-800 shadow-xl max-h-60 overflow-auto',
            'animate-in fade-in slide-in-from-top-2 duration-200'
          )}
          role="listbox"
        >
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => {
                setActiveCategory(category);
                setIsOpen(false);
              }}
              className={cn(
                'w-full px-4 py-3 text-left text-sm transition-colors',
                'first:rounded-t-lg last:rounded-b-lg',
                category === activeCategory
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
                  : 'text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
              )}
              role="option"
              aria-selected={category === activeCategory}
            >
              <div className="flex items-center gap-2">
                {category === activeCategory && (
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                <span className={cn(category !== activeCategory && 'ml-6')}>
                  {category}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}