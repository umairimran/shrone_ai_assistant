'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage, ChatSessionState, Citation, UploadedDoc, ConversationSummary, ChatSession } from '@/lib/types';
import { getDocTypeFromFile, prefersReducedMotion, toMB, generateUUID } from '@/lib/utils';

// Enhanced interface that includes conversation management
interface EnhancedChatContextValue extends ChatSessionState {
  // Original chat functionality
  setActiveDocument: (_id: string | null) => void;
  setActiveCategory: (_category: string) => void;
  sendMessage: (_text: string) => Promise<void>;
  deleteDocument: (_id: string) => void;
  uploadFiles: (_files: FileList | File[]) => Promise<'ok' | 'invalid' | 'failed'>;
  
  // New conversation management functionality
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  isLoadingConversations: boolean;
  
  // Conversation actions
  startNewConversation: () => void;
  loadConversation: (_conversationId: string) => void;
  deleteConversation: (_conversationId: string) => void;
  renameConversation: (_conversationId: string, _newTitle: string) => void;
  
  // Utility functions
  generateConversationTitle: (_firstMessage: string) => string;
  getConversationSummary: (_conversationId: string) => ConversationSummary | null;
}

const EnhancedChatContext = createContext<EnhancedChatContextValue | undefined>(undefined);

// Storage keys
const DOCUMENTS_KEY = 'leasing-ai-documents';
const ACTIVE_DOC_KEY = 'leasing-ai-active-document';
const ACTIVE_CATEGORY_KEY = 'leasing-ai-active-category';
const CONVERSATIONS_KEY = 'leasing-ai-conversations';
const CURRENT_CONVERSATION_KEY = 'leasing-ai-current-conversation';

// Default data - Start with empty state to prevent flash
const defaultCategory = 'All Categories';

// Initial empty state for server-side rendering
const initialState: ChatSessionState = {
  activeDocumentId: null,
  documents: [],
  messages: [],
  isAssistantTyping: false,
  activeCategory: defaultCategory
};

// Helper functions
function generateConversationTitle(firstMessage: string): string {
  const cleaned = firstMessage.trim().slice(0, 50);
  return cleaned.length < firstMessage.trim().length ? cleaned + '...' : cleaned;
}

function createConversationSummary(conversation: ChatSession): ConversationSummary {
  const userMessages = conversation.messages.filter(m => m.role === 'user');
  const assistantMessages = conversation.messages.filter(m => m.role === 'assistant');
  const totalCitations = assistantMessages.reduce((acc, m) => acc + (m.citations?.length || 0), 0);
  
  const firstUserMessage = userMessages[0]?.content || '';
  const lastMessage = conversation.messages[conversation.messages.length - 1]?.content || '';
  const snippet = assistantMessages[0]?.content.slice(0, 100) + '...' || lastMessage.slice(0, 100) + '...';

  return {
    id: conversation.id,
    title: conversation.title,
    snippet,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    hasAssistantResponse: assistantMessages.length > 0,
    firstUserMessage,
    lastMessage,
    documentId: conversation.documentId,
    category: conversation.category,
    citationCount: totalCitations
  };
}

// Storage functions
function loadDocuments(): UploadedDoc[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DOCUMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UploadedDoc[];
    return parsed;
  } catch (error) {
    console.warn('Failed to load documents from storage', error);
    return [];
  }
}

function loadActiveDocument(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACTIVE_DOC_KEY) ?? null;
}

function loadActiveCategory(): string {
  if (typeof window === 'undefined') return defaultCategory;
  // Always return "All Categories" for now (other categories disabled)
  return defaultCategory;
  // return window.localStorage.getItem(ACTIVE_CATEGORY_KEY) ?? defaultCategory;
}

function loadConversations(): ChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatSession[];
  } catch (error) {
    console.warn('Failed to load conversations from storage', error);
    return [];
  }
}

function loadCurrentConversationId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(CURRENT_CONVERSATION_KEY) ?? null;
}

function persistDocuments(docs: UploadedDoc[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(docs));
}

function persistConversations(conversations: ChatSession[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  console.log('💾 Persisted conversations:', conversations.length, 'sessions');
}

function persistCurrentConversationId(conversationId: string | null) {
  if (typeof window === 'undefined') return;
  if (conversationId) {
    window.localStorage.setItem(CURRENT_CONVERSATION_KEY, conversationId);
    console.log('💾 Persisted current conversation ID:', conversationId);
  } else {
    window.localStorage.removeItem(CURRENT_CONVERSATION_KEY);
    console.log('💾 Cleared current conversation ID');
  }
}

function persistActiveDocument(docId: string | null) {
  if (typeof window === 'undefined') return;
  if (!docId) {
    window.localStorage.removeItem(ACTIVE_DOC_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_DOC_KEY, docId);
}

function persistActiveCategory(category: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTIVE_CATEGORY_KEY, category);
}

interface AskServiceResponse {
  answer: string;
  citations: Citation[];
}

export function EnhancedChatProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<ChatSessionState>(initialState);
  const [conversations, setConversations] = useState<ChatSession[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const progressTimers = useRef<Record<string, number>>({});
  const reducedMotionRef = useRef<boolean>(false);

  // Initialize data after mount to prevent hydration mismatch
  useEffect(() => {
    reducedMotionRef.current = prefersReducedMotion();
    if (typeof window === 'undefined') return;

    const docs = loadDocuments();
    const activeDocId = loadActiveDocument();
    const category = loadActiveCategory();
    let loadedConversations = loadConversations();
    let currentConvId = loadCurrentConversationId();

    // If no conversations exist, create a default one
    if (loadedConversations.length === 0) {
      console.log('📝 No conversations found, creating default session...');
      const newConvId = `conversation-${generateUUID()}`;
      const now = new Date().toISOString();
      const defaultConversation: ChatSession = {
        id: newConvId,
        title: 'New Conversation',
        messages: [],
        createdAt: now,
        updatedAt: now,
        documentId: activeDocId,
        category: category,
        isActive: true
      };
      loadedConversations = [defaultConversation];
      currentConvId = newConvId;
      persistConversations(loadedConversations);
      persistCurrentConversationId(newConvId);
    } else {
      console.log('📚 Loaded conversations from storage:', loadedConversations.length, 'sessions');
      console.log('🎯 Current conversation ID:', currentConvId);
    }

    // Find current conversation and load its messages
    const currentConversation = currentConvId 
      ? loadedConversations.find(conv => conv.id === currentConvId)
      : loadedConversations[0]; // Use first conversation if no current ID
    const messages = currentConversation?.messages || [];
    const finalConvId = currentConversation?.id || null;

    console.log('💬 Loaded messages:', messages.length, 'for conversation:', finalConvId);

    setState({
      activeDocumentId: activeDocId,
      documents: docs,
      messages,
      isAssistantTyping: false,
      activeCategory: category
    });

    setConversations(loadedConversations);
    setCurrentConversationId(finalConvId);
    setIsLoadingConversations(false);
    setMounted(true);
  }, []);

  // Listen for document cache clearing events from ManagementContext
  useEffect(() => {
    const handleCacheCleared = () => {
      console.log('🔄 EnhancedChatContext: Cache cleared event received, clearing documents');
      setState(prev => ({
        ...prev,
        documents: [], // Clear documents to force refresh
        activeDocumentId: null
      }));
      persistActiveDocument(null);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('documentCacheCleared', handleCacheCleared);
      
      return () => {
        window.removeEventListener('documentCacheCleared', handleCacheCleared);
      };
    }
  }, []);

  // Update conversation when messages change
  useEffect(() => {
    if (!mounted || !currentConversationId) return;

    setConversations(prev => {
      const conversationExists = prev.some(conv => conv.id === currentConversationId);
      
      if (!conversationExists) {
        // Create new conversation if it doesn't exist
        const newConversation: ChatSession = {
          id: currentConversationId,
          title: state.messages.length > 0 
            ? generateConversationTitle(state.messages.find(m => m.role === 'user')?.content || 'New Conversation')
            : 'New Conversation',
          messages: state.messages,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          documentId: state.activeDocumentId,
          category: state.activeCategory,
          isActive: true
        };
        const updated = [...prev.map(c => ({ ...c, isActive: false })), newConversation];
        persistConversations(updated);
        return updated;
      }
      
      // Update existing conversation
      const updated = prev.map(conv => {
        if (conv.id === currentConversationId) {
          const updatedConv = {
            ...conv,
            messages: state.messages,
            updatedAt: new Date().toISOString(),
            documentId: state.activeDocumentId,
            category: state.activeCategory
          };
          return updatedConv;
        }
        return conv;
      });
      
      persistConversations(updated);
      return updated;
    });
  }, [mounted, state.messages, currentConversationId, state.activeDocumentId, state.activeCategory]);

  const setActiveDocument = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, activeDocumentId: id }));
    persistActiveDocument(id);
  }, []);

  const setActiveCategory = useCallback((category: string) => {
    setState(prev => ({ ...prev, activeCategory: category }));
    persistActiveCategory(category);
  }, []);

  const deleteDocument = useCallback((id: string) => {
    setState((prev) => {
      const remainingDocs = prev.documents.filter((doc) => doc.id !== id);
      persistDocuments(remainingDocs);
      
      const nextActiveId = prev.activeDocumentId === id ? null : prev.activeDocumentId;
      persistActiveDocument(nextActiveId);
      
      return {
        ...prev,
        documents: remainingDocs,
        activeDocumentId: nextActiveId
      };
    });
  }, []);

  const stopProgressTimer = useCallback((docId: string) => {
    const timer = progressTimers.current[docId];
    if (timer) {
      clearInterval(timer);
      delete progressTimers.current[docId];
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Ensure we have a conversation session
      if (!currentConversationId) {
        console.warn('⚠️ No current conversation, creating one...');
        const newConvId = `conversation-${generateUUID()}`;
        const now = new Date().toISOString();
        const newConversation: ChatSession = {
          id: newConvId,
          title: 'New Conversation',
          messages: [],
          createdAt: now,
          updatedAt: now,
          documentId: state.activeDocumentId,
          category: state.activeCategory,
          isActive: true
        };
        
        setConversations(prev => {
          const updated = [...prev.map(c => ({ ...c, isActive: false })), newConversation];
          persistConversations(updated);
          return updated;
        });
        setCurrentConversationId(newConvId);
        persistCurrentConversationId(newConvId);
      }

      const userMessage: ChatMessage = {
        id: generateUUID(),
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString()
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
        isAssistantTyping: true
      }));

      try {
        // Prepare conversation history for context (exclude the current message)
        const conversationHistory = state.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.createdAt
        }));

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            question: trimmed,
            category: state.activeCategory,
            conversation_history: conversationHistory
          })
        });

        if (!response.ok) {
          throw new Error('Unable to reach assistant');
        }

        const data = (await response.json()) as AskServiceResponse;
        
        // Transform backend citation format to frontend Citation format
        const transformedCitations = Array.isArray(data.citations) ? data.citations.map((citation, index) => ({
          id: citation.id || `citation-${index + 1}`,
          doc_title: citation.document?.title || citation.title || citation.doc_title || 'Untitled Document',
          quote: citation.quote || '',
          title: citation.document?.title || citation.title || citation.doc_title,
          category: citation.document?.category || citation.category,
          section: citation.document?.section || citation.section,
          date: citation.document?.date || citation.date,
          year: citation.document?.year || citation.year,
          pages: citation.pages,
          hierarchy_path: citation.hierarchy_path,
          link: citation.link,
          page_span: citation.page_span,
          confidence_score: citation.confidence_score,
          meta: citation.meta,
          document: citation.document
        })) : [];

        const assistantMessage: ChatMessage = {
          id: generateUUID(),
          role: 'assistant',
          content: data.answer ?? '',
          createdAt: new Date().toISOString(),
          citations: transformedCitations
        };

        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, assistantMessage]
        }));
      } catch (error) {
        console.error('sendMessage error', error);
        const fallback: ChatMessage = {
          id: generateUUID(),
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again later.',
          createdAt: new Date().toISOString(),
          citations: []
        };
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, fallback]
        }));
      } finally {
        setState((prev) => ({ ...prev, isAssistantTyping: false }));
      }
    },
    [currentConversationId, state.activeCategory, state.activeDocumentId, state.messages]
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (!fileArray.length) return 'invalid';

      const invalidFiles = fileArray.filter((file) => {
        const sizeMB = toMB(file.size);
        const docType = getDocTypeFromFile(file);
        return sizeMB > 200 || !docType;
      });

      if (invalidFiles.length) {
        return 'invalid';
      }

      const uploadingDocs: UploadedDoc[] = fileArray.map((file) => ({
        id: `upload-${generateUUID()}`,
        name: file.name,
        sizeMB: Number(toMB(file.size).toFixed(1)),
        type: getDocTypeFromFile(file) ?? 'pdf',
        status: 'uploading',
        progress: 0
      }));

      setState((prev) => {
        const documents = [...prev.documents, ...uploadingDocs];
        persistDocuments(documents);
        return { ...prev, documents };
      });

      uploadingDocs.forEach((doc) => {
        const intervalDelay = reducedMotionRef.current ? 150 : 220;
        const timer = window.setInterval(() => {
          setState((prev) => {
            const documents = prev.documents.map((item) =>
              item.id === doc.id
                ? {
                    ...item,
                    progress: Math.min(95, (item.progress ?? 0) + Math.random() * 15)
                  }
                : item
            );
            return { ...prev, documents };
          });
        }, intervalDelay);
        progressTimers.current[doc.id] = timer;
      });

      try {
        const formData = new FormData();
        fileArray.forEach((file) => {
          formData.append('files', file);
        });
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        if (!response.ok) {
          throw new Error('Upload failed');
        }
        const data = (await response.json()) as { docs: UploadedDoc[] };

        setState((prev) => {
          const filtered = prev.documents.filter((doc) => !uploadingDocs.some((u) => u.id === doc.id));
          const uploaded = data.docs.map((doc) => ({ ...doc, progress: 100 }));
          const documents = [...filtered, ...uploaded];
          persistDocuments(documents);
          return {
            ...prev,
            documents,
            activeDocumentId: prev.activeDocumentId ?? (uploaded[0]?.id ?? null)
          };
        });
        uploadingDocs.forEach((doc) => stopProgressTimer(doc.id));
        return 'ok';
      } catch (error) {
        console.error('Upload error', error);
        uploadingDocs.forEach((doc) => stopProgressTimer(doc.id));
        setState((prev) => {
          const documents = prev.documents.map((doc) =>
            uploadingDocs.some((u) => u.id === doc.id)
              ? { ...doc, status: 'failed' as const, progress: 0 }
              : doc
          );
          persistDocuments(documents);
          return { ...prev, documents };
        });
        return 'failed';
      }
    },
    [stopProgressTimer]
  );

  // New conversation management functions
  const startNewConversation = useCallback(() => {
    const newConversationId = `conversation-${generateUUID()}`;
    const now = new Date().toISOString();
    
    const newConversation: ChatSession = {
      id: newConversationId,
      title: 'New Conversation',
      messages: [],
      createdAt: now,
      updatedAt: now,
      documentId: state.activeDocumentId,
      category: state.activeCategory,
      isActive: true
    };

    setConversations(prev => {
      const updated = [...prev.map(c => ({ ...c, isActive: false })), newConversation];
      persistConversations(updated);
      return updated;
    });

    setCurrentConversationId(newConversationId);
    persistCurrentConversationId(newConversationId);
    
    setState(prev => ({
      ...prev,
      messages: [],
      isAssistantTyping: false
    }));
  }, [state.activeDocumentId, state.activeCategory]);

  const loadConversation = useCallback((conversationId: string) => {
    const conversation = conversations.find(conv => conv.id === conversationId);
    if (!conversation) return;

    setCurrentConversationId(conversationId);
    persistCurrentConversationId(conversationId);

    setState(prev => ({
      ...prev,
      messages: conversation.messages,
      activeDocumentId: conversation.documentId,
      activeCategory: conversation.category,
      isAssistantTyping: false
    }));

    // Update active status
    setConversations(prev => {
      const updated = prev.map(conv => ({
        ...conv,
        isActive: conv.id === conversationId
      }));
      persistConversations(updated);
      return updated;
    });
  }, [conversations]);

  const deleteConversation = useCallback((conversationId: string) => {
    setConversations(prev => {
      const filtered = prev.filter(conv => conv.id !== conversationId);
      persistConversations(filtered);
      
      // If we deleted the current conversation, switch to the most recent one
      if (conversationId === currentConversationId) {
        const mostRecent = filtered.length > 0 ? filtered[0] : null;
        if (mostRecent) {
          loadConversation(mostRecent.id);
        } else {
          startNewConversation();
        }
      }
      
      return filtered;
    });
  }, [currentConversationId, loadConversation, startNewConversation]);

  const renameConversation = useCallback((conversationId: string, newTitle: string) => {
    setConversations(prev => {
      const updated = prev.map(conv =>
        conv.id === conversationId
          ? { ...conv, title: newTitle, updatedAt: new Date().toISOString() }
          : conv
      );
      persistConversations(updated);
      return updated;
    });
  }, []);

  const getConversationSummary = useCallback((conversationId: string): ConversationSummary | null => {
    const conversation = conversations.find(conv => conv.id === conversationId);
    return conversation ? createConversationSummary(conversation) : null;
  }, [conversations]);

  const conversationSummaries = useMemo(() => {
    return conversations
      .map(createConversationSummary)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [conversations]);

  // Auto-generate title for new conversations
  useEffect(() => {
    if (!currentConversationId) return;
    
    const currentConversation = conversations.find(conv => conv.id === currentConversationId);
    const userMessages = state.messages.filter(m => m.role === 'user');
    
    if (currentConversation && 
        currentConversation.title === 'New Conversation' && 
        userMessages.length > 0) {
      const newTitle = generateConversationTitle(userMessages[0].content);
      renameConversation(currentConversationId, newTitle);
    }
  }, [state.messages, currentConversationId, conversations, renameConversation]);

  useEffect(() => {
    return () => {
      Object.values(progressTimers.current).forEach((timer) => clearInterval(timer));
    };
  }, []);

  const value = useMemo(
    (): EnhancedChatContextValue => ({
      ...state,
      setActiveDocument,
      setActiveCategory,
      sendMessage,
      deleteDocument,
      uploadFiles,
      
      // Conversation management
      conversations: conversationSummaries,
      currentConversationId,
      isLoadingConversations,
      
      startNewConversation,
      loadConversation,
      deleteConversation,
      renameConversation,
      
      generateConversationTitle,
      getConversationSummary
    }),
    [
      state,
      setActiveDocument,
      setActiveCategory,
      sendMessage,
      deleteDocument,
      uploadFiles,
      conversationSummaries,
      currentConversationId,
      isLoadingConversations,
      startNewConversation,
      loadConversation,
      deleteConversation,
      renameConversation,
      getConversationSummary
    ]
  );

  return <EnhancedChatContext.Provider value={value}>{children}</EnhancedChatContext.Provider>;
}

export function useEnhancedChat() {
  const context = useContext(EnhancedChatContext);
  if (!context) {
    throw new Error('useEnhancedChat must be used within an EnhancedChatProvider');
  }
  return context;
}

// Keep original useChat for backward compatibility
export { useChat } from './ChatContext';