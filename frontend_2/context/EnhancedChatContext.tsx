'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage, ChatSessionState, Citation, UploadedDoc, ConversationSummary, ChatSession } from '@/lib/types';
import { getDocTypeFromFile, prefersReducedMotion, toMB } from '@/lib/utils';

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

// Default data
const seedDocument: UploadedDoc = {
  id: 'doc-1',
  name: "It's Sugar Lease - Lincoln Road 2",
  sizeMB: 1.8,
  type: 'pdf',
  status: 'uploaded'
};

const seedMessages: ChatMessage[] = [
  {
    id: 'seed-user-1',
    role: 'user',
    content: 'hello there sir how are you',
    createdAt: '2024-01-01T09:21:27.000Z'
  },
  {
    id: 'seed-assistant-1',
    role: 'assistant',
    content: "Hello! I'm here to assist you. How can I help you today?",
    createdAt: '2024-01-01T09:23:14.000Z'
  }
];

const defaultCategory = 'Board and Committee Proceedings';
const defaultConversationId = 'default-conversation';

const initialState: ChatSessionState = {
  activeDocumentId: seedDocument.id,
  documents: [seedDocument],
  messages: seedMessages,
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
  if (typeof window === 'undefined') return initialState.documents;
  try {
    const raw = window.localStorage.getItem(DOCUMENTS_KEY);
    if (!raw) return initialState.documents;
    const parsed = JSON.parse(raw) as UploadedDoc[];
    return parsed.length ? parsed : initialState.documents;
  } catch (error) {
    console.warn('Failed to load documents from storage', error);
    return initialState.documents;
  }
}

function loadActiveDocument(): string | null {
  if (typeof window === 'undefined') return initialState.activeDocumentId;
  return window.localStorage.getItem(ACTIVE_DOC_KEY) ?? initialState.activeDocumentId;
}

function loadActiveCategory(): string {
  if (typeof window === 'undefined') return initialState.activeCategory;
  return window.localStorage.getItem(ACTIVE_CATEGORY_KEY) ?? initialState.activeCategory;
}

function loadConversations(): ChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) {
      // Create default conversation with seed data
      const defaultConversation: ChatSession = {
        id: defaultConversationId,
        title: generateConversationTitle(seedMessages[0]?.content || 'Welcome'),
        messages: seedMessages,
        createdAt: seedMessages[0]?.createdAt || new Date().toISOString(),
        updatedAt: seedMessages[seedMessages.length - 1]?.createdAt || new Date().toISOString(),
        documentId: seedDocument.id,
        category: defaultCategory,
        isActive: true
      };
      return [defaultConversation];
    }
    return JSON.parse(raw) as ChatSession[];
  } catch (error) {
    console.warn('Failed to load conversations from storage', error);
    return [];
  }
}

function loadCurrentConversationId(): string | null {
  if (typeof window === 'undefined') return defaultConversationId;
  return window.localStorage.getItem(CURRENT_CONVERSATION_KEY) ?? defaultConversationId;
}

function persistDocuments(docs: UploadedDoc[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(docs));
}

function persistConversations(conversations: ChatSession[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
}

function persistCurrentConversationId(conversationId: string | null) {
  if (typeof window === 'undefined') return;
  if (conversationId) {
    window.localStorage.setItem(CURRENT_CONVERSATION_KEY, conversationId);
  } else {
    window.localStorage.removeItem(CURRENT_CONVERSATION_KEY);
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
  const [state, setState] = useState<ChatSessionState>(initialState);
  const [conversations, setConversations] = useState<ChatSession[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(defaultConversationId);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const progressTimers = useRef<Record<string, number>>({});
  const reducedMotionRef = useRef<boolean>(false);

  // Initialize data
  useEffect(() => {
    reducedMotionRef.current = prefersReducedMotion();
    if (typeof window === 'undefined') return;

    const docs = loadDocuments();
    const activeDocId = loadActiveDocument();
    const category = loadActiveCategory();
    const loadedConversations = loadConversations();
    const currentConvId = loadCurrentConversationId();

    // Find current conversation and load its messages
    const currentConversation = loadedConversations.find(conv => conv.id === currentConvId);
    const messages = currentConversation?.messages || [];

    setState({
      activeDocumentId: activeDocId,
      documents: docs,
      messages,
      isAssistantTyping: false,
      activeCategory: category
    });

    setConversations(loadedConversations);
    setCurrentConversationId(currentConvId);
    setIsLoadingConversations(false);
  }, []);

  // Update conversation when messages change
  useEffect(() => {
    if (!currentConversationId || state.messages.length === 0) return;

    setConversations(prev => {
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
  }, [state.messages, currentConversationId, state.activeDocumentId, state.activeCategory]);

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

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
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
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            question: trimmed,
            category: state.activeCategory
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
          id: crypto.randomUUID(),
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
          id: crypto.randomUUID(),
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
    [state.activeCategory]
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
        id: `upload-${crypto.randomUUID()}`,
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
    const newConversationId = `conversation-${crypto.randomUUID()}`;
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