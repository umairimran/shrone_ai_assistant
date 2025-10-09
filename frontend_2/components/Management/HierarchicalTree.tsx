'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { CategoryNode } from './CategoryNode';
import { CreateCategoryModal } from './CreateCategoryModal';
import { CreateYearModal } from './CreateYearModal';
import { useManagement } from '@/context/ManagementContext';
import { TreeExpandedState, YearFolder, CategoryTreeNode, CreateCategoryData, CreateYearData } from '@/lib/types';
import { cn } from '@/lib/utils';

interface HierarchicalTreeProps {
  className?: string;
  onDocumentSelect?: (document: any) => void;
  onDocumentDelete?: (documentId: string) => Promise<boolean>;
  onUploadDocument?: (categoryId: string, year?: string) => void;
}

export function HierarchicalTree({ 
  className, 
  onDocumentSelect, 
  onDocumentDelete,
  onUploadDocument 
}: HierarchicalTreeProps) {
  const { 
    categories, 
    getDocumentsByCategory, 
    uploadDocument 
  } = useManagement();

  const [expandedState, setExpandedState] = useState<TreeExpandedState>({});
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [showCreateYearModal, setShowCreateYearModal] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [uploadContext, setUploadContext] = useState<{categoryId: string, year?: string} | null>(null);

  // Transform categories into tree nodes with year folders
  const treeNodes: CategoryTreeNode[] = useMemo(() => {
    return categories.map(category => {
      const documents = getDocumentsByCategory(category.id);
      
      // Group documents by year
      const yearGroups: { [year: string]: any[] } = {};
      documents.forEach(doc => {
        const year = doc.issueDate ? new Date(doc.issueDate).getFullYear().toString() : '2024';
        if (!yearGroups[year]) {
          yearGroups[year] = [];
        }
        yearGroups[year].push(doc);
      });

      // Create year folders, sorted by year (descending)
      const yearFolders: YearFolder[] = Object.entries(yearGroups)
        .map(([year, docs]) => ({
          year,
          documents: docs,
          documentCount: docs.length
        }))
        .sort((a, b) => parseInt(b.year) - parseInt(a.year));

      return {
        id: category.id,
        name: category.name,
        description: category.description,
        documentCount: documents.length,
        yearFolders,
        isExpanded: expandedState[category.id]?.isExpanded || false
      };
    });
  }, [categories, getDocumentsByCategory, expandedState]);

  const handleToggleCategory = useCallback((categoryId: string) => {
    setExpandedState(prev => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        isExpanded: !prev[categoryId]?.isExpanded,
        years: prev[categoryId]?.years || {}
      }
    }));
  }, []);

  const handleToggleYear = useCallback((categoryId: string, year: string) => {
    setExpandedState(prev => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        isExpanded: prev[categoryId]?.isExpanded || false,
        years: {
          ...prev[categoryId]?.years,
          [year]: !prev[categoryId]?.years?.[year]
        }
      }
    }));
  }, []);

  const handleCreateCategory = useCallback(async (data: CreateCategoryData) => {
    // For now, we'll just close the modal since categories are predefined
    // In a real implementation, this would call an API to create the category
    console.log('Creating category:', data);
    setShowCreateCategoryModal(false);
    // TODO: Implement category creation API call
  }, []);

  const handleCreateYear = useCallback(async (data: CreateYearData) => {
    // Year folders are created automatically when documents are uploaded
    // This is more of a placeholder for future functionality
    console.log('Creating year folder:', data);
    setShowCreateYearModal(false);
    // TODO: This could create a placeholder year folder or just close the modal
  }, []);

  const handleNewYearFolder = useCallback((categoryId: string) => {
    setActiveCategory(categoryId);
    setShowCreateYearModal(true);
  }, []);

  const handleUploadDocument = useCallback((categoryId: string, year?: string) => {
    setUploadContext({ categoryId, year });
    // Pass the upload request up to the parent component
    onUploadDocument?.(categoryId, year);
  }, [onUploadDocument]);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Tree Nodes */}
      <div className="space-y-1">
        {treeNodes.map(node => (
          <CategoryNode
            key={node.id}
            node={node}
            isExpanded={node.isExpanded}
            yearExpandedState={expandedState[node.id]?.years || {}}
            onToggleCategory={handleToggleCategory}
            onToggleYear={handleToggleYear}
            onNewYearFolder={handleNewYearFolder}
            onUploadDocument={handleUploadDocument}
            onDocumentSelect={onDocumentSelect}
            onDocumentDelete={onDocumentDelete}
          />
        ))}
      </div>

      {/* Create New Category Button */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setShowCreateCategoryModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-md transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create New Category
        </button>
      </div>

      {/* Modals */}
      <CreateCategoryModal
        isOpen={showCreateCategoryModal}
        onClose={() => setShowCreateCategoryModal(false)}
        onCreate={handleCreateCategory}
      />

      <CreateYearModal
        isOpen={showCreateYearModal}
        onClose={() => setShowCreateYearModal(false)}
        onCreate={handleCreateYear}
        categoryId={activeCategory}
        categories={categories}
      />
    </div>
  );
}