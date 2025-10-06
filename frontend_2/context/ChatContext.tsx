'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage, ChatSessionState, Citation, UploadedDoc } from '@/lib/types';
import { getDocTypeFromFile, prefersReducedMotion, toMB } from '@/lib/utils';

interface ChatContextValue extends ChatSessionState {
  setActiveDocument: (_id: string | null) => void;
  setActiveCategory: (_category: string) => void;
  sendMessage: (_text: string) => Promise<void>;
  deleteDocument: (_id: string) => void;
  uploadFiles: (_files: FileList | File[]) => Promise<'ok' | 'invalid' | 'failed'>;
}


const ChatContext = createContext<ChatContextValue | undefined>(undefined);

const DOCUMENTS_KEY = 'leasing-ai-documents';
const ACTIVE_DOC_KEY = 'leasing-ai-active-document';
const ACTIVE_CATEGORY_KEY = 'leasing-ai-active-category';
const MESSAGE_KEY = (docId: string | null) => `leasing-ai-messages-${docId ?? 'global'}`;

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
    content: "Hello! I’m here to assist you. How can I help you today?",
    createdAt: '2024-01-01T09:23:14.000Z'
  }
];

const defaultCategory = 'Board and Committee Proceedings';

const initialState: ChatSessionState = {
  activeDocumentId: seedDocument.id,
  documents: [seedDocument],
  messages: seedMessages,
  isAssistantTyping: false,
  activeCategory: defaultCategory
};

interface AskServiceResponse {
  answer: string;
  citations: Citation[];
}

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

function loadMessagesForDocument(docId: string | null): ChatMessage[] {
  if (typeof window === 'undefined') {
    return docId === seedDocument.id ? seedMessages : [];
  }
  try {
    const key = MESSAGE_KEY(docId);
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return docId === seedDocument.id ? seedMessages : [];
    }
    const parsed = JSON.parse(raw) as ChatMessage[];
    return parsed;
  } catch (error) {
    console.warn('Failed to load messages from storage', error);
    return docId === seedDocument.id ? seedMessages : [];
  }
}

function persistDocuments(docs: UploadedDoc[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(docs));
}

function persistMessages(docId: string | null, messages: ChatMessage[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MESSAGE_KEY(docId), JSON.stringify(messages));
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

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ChatSessionState>(initialState);
  const progressTimers = useRef<Record<string, number>>({});
  const reducedMotionRef = useRef<boolean>(false);

  useEffect(() => {
    reducedMotionRef.current = prefersReducedMotion();
    if (typeof window === 'undefined') return;
    const docs = loadDocuments();
    const activeDocId = loadActiveDocument();
    const category = loadActiveCategory();
    const messages = loadMessagesForDocument(activeDocId);
    setState({
      activeDocumentId: activeDocId,
      documents: docs,
      messages,
      isAssistantTyping: false,
      activeCategory: category
    });
  }, []);

  const setActiveDocument = useCallback((id: string | null) => {
    setState((prev) => {
      const nextMessages = loadMessagesForDocument(id);
      persistActiveDocument(id);
      return {
        ...prev,
        activeDocumentId: id,
        messages: nextMessages,
        isAssistantTyping: false
      };
    });
  }, []);

  const setActiveCategory = useCallback((category: string) => {
    setState((prev) => {
      persistActiveCategory(category);
      return { ...prev, activeCategory: category };
    });
  }, []);

  const deleteDocument = useCallback((id: string) => {
    setState((prev) => {
      const remainingDocs = prev.documents.filter((doc) => doc.id !== id);
      persistDocuments(remainingDocs);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(MESSAGE_KEY(id));
      }
      const nextActiveId = prev.activeDocumentId === id ? null : prev.activeDocumentId;
      const nextMessages = loadMessagesForDocument(nextActiveId);
      persistActiveDocument(nextActiveId);
      return {
        ...prev,
        documents: remainingDocs,
        activeDocumentId: nextActiveId,
        messages: nextMessages,
        isAssistantTyping: false
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

      setState((prev) => {
        const messages = [...prev.messages, userMessage];
        persistMessages(prev.activeDocumentId, messages);
        return {
          ...prev,
          messages,
          isAssistantTyping: true
        };
      });

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
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer ?? '',
          createdAt: new Date().toISOString(),
          citations: Array.isArray(data.citations) ? data.citations : []
        };

        setState((prev) => {
          const messages = [...prev.messages, assistantMessage];
          persistMessages(prev.activeDocumentId, messages);
          return { ...prev, messages };
        });
      } catch (error) {
        console.error('sendMessage error', error);
        const fallback: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again later.',
          createdAt: new Date().toISOString(),
          citations: []
        };
        setState((prev) => {
          const messages = [...prev.messages, fallback];
          persistMessages(prev.activeDocumentId, messages);
          return { ...prev, messages };
        });
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


  useEffect(() => {
    return () => {
      Object.values(progressTimers.current).forEach((timer) => clearInterval(timer));
    };
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      setActiveDocument,
      setActiveCategory,
      sendMessage,
      deleteDocument,
      uploadFiles
    }),
    [deleteDocument, sendMessage, setActiveCategory, setActiveDocument, state, uploadFiles]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
