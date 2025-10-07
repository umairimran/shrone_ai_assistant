// Chat message types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string; // Plain text for user messages
  answer_html?: string; // HTML with data-cite attributes for assistant
  createdAt: string;
  citations?: Citation[];
  processingStatus?: 'complete' | 'partial' | 'processing' | 'documents_processing' | 'citations_extracting' | 'validation_pending';
  processingDetails?: string; // Optional custom details message
}

// Document citation type
export interface Citation {
  id: string;
  doc_title: string;
  title?: string;
  category?: string;
  section?: string;
  date?: string;
  year?: string;
  heading_path?: string;
  hierarchy_path?: string;
  pages?: string;
  quote: string;
  link?: string;
  page_span?: { start: number; end: number };
  confidence_score?: number;
  meta?: Record<string, any>;
  document?: {
    title?: string;
    category?: string;
    section?: string;
    date?: string;
    year?: string;
    pages?: string;
    heading_path?: string;
  };
}

// Document from backend API
export interface Document {
  filename: string;
  title: string;
  document_number: string;
  issued_date: string;
  year: number;
  chunks: number;
}

// API response for documents by category
export interface DocumentsResponse {
  category: string;
  table: string;
  documents: Document[];
  count: number;
  unique_filenames: string[];
}

// Uploaded document types
export interface UploadedDoc {
  id: string;
  name: string;
  sizeMB: number;
  type: string;
  status: 'uploading' | 'uploaded' | 'failed';
  progress?: number;
  // Extended metadata for management
  title?: string;
  version?: string;
  issueDate?: string;
  category?: string;
  uploadedAt?: string;
  filename?: string;
  source_file?: string;
}

// Chat session state
export interface ChatSessionState {
  activeDocumentId: string | null;
  documents: UploadedDoc[];
  messages: ChatMessage[];
  isAssistantTyping: boolean;
  activeCategory: string;
}

// API response types
export interface UploadResponse {
  success: boolean;
  message?: string;
  document?: UploadedDoc;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
}

// Conversation history types
export interface ConversationSummary {
  id: string;
  title: string;
  snippet: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  hasAssistantResponse: boolean;
  firstUserMessage: string;
  lastMessage: string;
  documentId: string | null;
  category: string;
  citationCount?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  documentId: string | null;
  category: string;
  isActive: boolean;
}

export interface ConversationHistoryState {
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  isLoading: boolean;
}

// Management page types
export interface DocumentCategory {
  id: string;
  name: string;
  documentCount: number;
  description?: string;
}

export interface DocumentUploadData {
  title: string;
  version: string;
  issueDate: string;
  category: string;
  file: File;
}

export interface ManagementContextValue {
  categories: DocumentCategory[];
  selectedCategory: string | null;
  setSelectedCategory: (_categoryId: string | null) => void;
  uploadDocument: (_data: DocumentUploadData) => Promise<'ok' | 'invalid' | 'failed'>;
  deleteDocument: (_id: string) => Promise<boolean>;
  getDocumentsByCategory: (_categoryId: string) => UploadedDoc[];
  refreshDocuments: (_categoryName?: string) => Promise<void>;
  loading: Record<string, boolean>;
  fetchCategoryDocuments: (_categoryName: string) => Promise<UploadedDoc[]>;
  initializeDocumentCache: () => Promise<void>;
  clearDocumentCache: () => void;
  getCacheInfo: () => Array<{category: string, count: number, cachedAt: string}>;
}
