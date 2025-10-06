import { ChatMessage, Citation } from '@/lib/types';
import { jsPDF } from 'jspdf';
import { formatTime } from '@/lib/utils';

export interface ExportOptions {
  format: 'pdf' | 'html' | 'json' | 'markdown';
  includeCitations: boolean;
  includeMetadata: boolean;
  title?: string;
}

export class ExportService {
  /**
   * Export conversation to PDF format
   */
  static async exportToPDF(
    messages: ChatMessage[], 
    options: Partial<ExportOptions> = {}
  ): Promise<Blob> {
    const opts = {
      includeCitations: true,
      includeMetadata: true,
      title: 'Conversation Export',
      ...options
    };

    const pdf = new jsPDF();
    const margin = 20;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const textWidth = pageWidth - 2 * margin;
    let yPosition = margin;

    // Title
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text(opts.title, margin, yPosition);
    yPosition += 20;

    // Metadata
    if (opts.includeMetadata) {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Exported on: ${new Date().toLocaleDateString()}`, margin, yPosition);
      yPosition += 10;
      pdf.text(`Total messages: ${messages.length}`, margin, yPosition);
      yPosition += 15;
    }

    // Messages
    for (const message of messages) {
      // Check if we need a new page
      if (yPosition > pageHeight - 50) {
        pdf.addPage();
        yPosition = margin;
      }

      // Role indicator
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      const roleText = message.role === 'user' ? 'Question:' : 'Answer:';
      pdf.text(roleText, margin, yPosition);
      yPosition += 15;

      // Content
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      const content = message.answer_html 
        ? message.answer_html.replace(/<[^>]*>/g, '') // Strip HTML tags
        : message.content;
      
      const lines = pdf.splitTextToSize(content, textWidth);
      pdf.text(lines, margin, yPosition);
      yPosition += lines.length * 5 + 10;

      // Citations
      if (opts.includeCitations && message.citations && message.citations.length > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.text('Citations:', margin, yPosition);
        yPosition += 10;
        
        pdf.setFont('helvetica', 'normal');
        message.citations.forEach((citation, index) => {
          const citationText = this.formatCitationText(citation, index);
          const citationLines = pdf.splitTextToSize(citationText, textWidth);
          pdf.text(citationLines, margin + 10, yPosition);
          yPosition += citationLines.length * 5 + 5;
        });
      }

      // Timestamp
      if (opts.includeMetadata) {
        pdf.setFontSize(8);
        pdf.setTextColor(128, 128, 128);
        pdf.text(formatTime(message.createdAt), margin, yPosition);
        pdf.setTextColor(0, 0, 0);
        yPosition += 15;
      }
    }

    return new Promise((resolve) => {
      const blob = pdf.output('blob');
      resolve(blob);
    });
  }

  /**
   * Export conversation to HTML format with preserved inline citations
   */
  static exportToHTML(
    messages: ChatMessage[], 
    options: Partial<ExportOptions> = {}
  ): string {
    const opts = {
      includeCitations: true,
      includeMetadata: true,
      title: 'Conversation Export',
      ...options
    };

    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${opts.title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        .header {
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .message {
            margin-bottom: 30px;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #e2e8f0;
        }
        .user-message {
            background-color: #f8fafc;
            border-left-color: #3b82f6;
        }
        .assistant-message {
            background-color: #fefefe;
            border-left-color: #10b981;
        }
        .role {
            font-weight: bold;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 10px;
            color: #64748b;
        }
        .content {
            margin-bottom: 15px;
        }
        .citations {
            background-color: #f1f5f9;
            padding: 15px;
            border-radius: 6px;
            margin-top: 15px;
        }
        .citations h4 {
            margin: 0 0 10px 0;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748b;
        }
        citation {
            margin-bottom: 8px;
            font-size: 14px;
            color: #475569;
        }
        .citation-marker {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            font-size: 12px;
            font-weight: 600;
            color: #2563eb;
            background-color: #dbeafe;
            border-radius: 50%;
            margin: 0 2px;
            cursor: pointer;
            text-decoration: none;
        }
        .citation-marker:hover {
            background-color: #bfdbfe;
            color: #1d4ed8;
        }
        .timestamp {
            font-size: 12px;
            color: #94a3b8;
            margin-top: 10px;
        }
        .metadata {
            font-size: 14px;
            color: #64748b;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${opts.title}</h1>`;

    if (opts.includeMetadata) {
      html += `
        <div class="metadata">
            <p>Exported on: ${new Date().toLocaleDateString()}</p>
            <p>Total messages: ${messages.length}</p>
        </div>`;
    }

    html += `
    </div>
    <div class="conversation">`;

    messages.forEach((message) => {
      const messageClass = message.role === 'user' ? 'user-message' : 'assistant-message';
      // Preserve original HTML with inline citations for assistant messages
      const content = message.role === 'assistant' && message.answer_html 
        ? message.answer_html 
        : this.escapeHtml(message.content);
      
      html += `
        <div class="message ${messageClass}">
            <div class="role">${message.role === 'user' ? 'Question' : 'Answer'}</div>
            <div class="content">${content}</div>`;

      if (opts.includeCitations && message.citations && message.citations.length > 0) {
        html += `
            <div class="citations">
                <h4>Citations</h4>`;
        
        message.citations.forEach((citation, index) => {
          const citationText = this.formatCitationText(citation, index);
          html += `<div class="citation">${citationText}</div>`;
        });
        
        html += `</div>`;
      }

      if (opts.includeMetadata) {
        html += `<div class="timestamp">${formatTime(message.createdAt)}</div>`;
      }

      html += `</div>`;
    });

    html += `
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Export conversation to JSON format
   */
  static exportToJSON(
    messages: ChatMessage[], 
    options: Partial<ExportOptions> = {}
  ): string {
    const opts = {
      includeCitations: true,
      includeMetadata: true,
      ...options
    };

    const exportData = {
      metadata: opts.includeMetadata ? {
        exportedAt: new Date().toISOString(),
        totalMessages: messages.length,
        title: opts.title || 'Conversation Export'
      } : undefined,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        answer_html: message.answer_html,
        createdAt: message.createdAt,
        processingStatus: message.processingStatus,
        citations: opts.includeCitations ? message.citations : undefined
      }))
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export conversation to Markdown format
   */
  static exportToMarkdown(
    messages: ChatMessage[], 
    options: Partial<ExportOptions> = {}
  ): string {
    const opts = {
      includeCitations: true,
      includeMetadata: true,
      title: 'Conversation Export',
      ...options
    };

    let markdown = `# ${opts.title}\n\n`;

    if (opts.includeMetadata) {
      markdown += `**Exported:** ${new Date().toLocaleDateString()}\n`;
      markdown += `**Total Messages:** ${messages.length}\n\n`;
      markdown += '---\n\n';
    }

    messages.forEach((message, _messageIndex) => {
      // Role and content
      const roleEmoji = message.role === 'user' ? '❓' : '💬';
      const roleTitle = message.role === 'user' ? 'Question' : 'Answer';
      
      markdown += `## ${roleEmoji} ${roleTitle}\n\n`;
      
      // For markdown, preserve citation markers but convert to readable format
      let content = message.answer_html || message.content;
      if (message.answer_html) {
        // Convert citation markers to markdown links
        content = content.replace(
          /<button[^>]*data-citation-id="(\d+)"[^>]*>(\d+)<\/button>/g, 
          '[$2](#citation-$1)'
        );
        // Strip remaining HTML tags
        content = content.replace(/<[^>]*>/g, '');
      }
        
      markdown += `${content}\n\n`;

      // Citations
      if (opts.includeCitations && message.citations && message.citations.length > 0) {
        markdown += `### 📚 Citations\n\n`;
        
        message.citations.forEach((citation, index) => {
          const citationText = this.formatCitationText(citation, index);
          markdown += `<a id="citation-${index + 1}"></a>${index + 1}. ${citationText}\n`;
        });
        
        markdown += '\n';
      }

      // Timestamp
      if (opts.includeMetadata) {
        markdown += `*${formatTime(message.createdAt)}*\n\n`;
      }

      markdown += '---\n\n';
    });

    return markdown;
  }

  /**
   * Download file with given content and filename
   */
  static downloadFile(content: string | Blob, filename: string, mimeType: string): void {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Format citation text for export
   */
  private static formatCitationText(citation: Citation, index: number): string {
    const parts = [`[${index + 1}]`, citation.doc_title];
    
    if (citation.hierarchy_path) {
      parts.push(citation.hierarchy_path);
    }
    
    if (citation.pages) {
      const formattedPages = citation.pages.toLowerCase().startsWith('p.') 
        ? citation.pages 
        : `p. ${citation.pages}`;
      parts.push(formattedPages);
    }
    
    if (citation.quote) {
      parts.push(`"${citation.quote}"`);
    }
    
    return parts.join(' • ');
  }

  /**
   * Escape HTML characters for safe rendering
   */
  private static escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Import conversation from JSON format for replay
   */
  static importFromJSON(jsonString: string): ChatMessage[] {
    try {
      const data = JSON.parse(jsonString);
      
      if (!data.messages || !Array.isArray(data.messages)) {
        throw new Error('Invalid conversation format: missing messages array');
      }
      
      return data.messages.map((msg: any, index: number) => ({
        id: msg.id || `imported-${index}`,
        role: msg.role as 'user' | 'assistant',
        content: msg.content || '',
        answer_html: msg.answer_html,
        createdAt: msg.createdAt || new Date().toISOString(),
        citations: msg.citations || [],
        processingStatus: msg.processingStatus || 'complete',
        processingDetails: msg.processingDetails
      }));
    } catch (error) {
      throw new Error(`Failed to import conversation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Import conversation from shared link
   */
  static importFromShareableLink(shareableLink: string): ChatMessage[] {
    try {
      const encoded = shareableLink.split('/shared/')[1];
      if (!encoded) {
        throw new Error('Invalid shareable link format');
      }
      
      const jsonString = decodeURIComponent(atob(encoded));
      return this.importFromJSON(jsonString);
    } catch (error) {
      throw new Error(`Failed to import from shareable link: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Validate conversation data integrity
   */
  static validateConversation(messages: ChatMessage[]): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!Array.isArray(messages)) {
      errors.push('Messages must be an array');
      return { isValid: false, errors, warnings };
    }
    
    messages.forEach((message, index) => {
      if (!message.id) {
        warnings.push(`Message ${index + 1} missing ID`);
      }
      
      if (!['user', 'assistant'].includes(message.role)) {
        errors.push(`Message ${index + 1} has invalid role: ${message.role}`);
      }
      
      if (!message.content && !message.answer_html) {
        errors.push(`Message ${index + 1} has no content`);
      }
      
      if (message.role === 'assistant' && message.answer_html) {
        // Check if HTML contains citation markers
        const citationMarkers = (message.answer_html.match(/data-citation-id="\d+"/g) || []).length;
        const citationCount = message.citations?.length || 0;
        
        if (citationMarkers !== citationCount) {
          warnings.push(`Message ${index + 1} citation markers (${citationMarkers}) don't match citations count (${citationCount})`);
        }
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Generate shareable link for conversation
   */
  static generateShareableLink(messages: ChatMessage[]): string {
    // Validate conversation before sharing
    const validation = this.validateConversation(messages);
    if (!validation.isValid) {
      throw new Error(`Cannot share invalid conversation: ${validation.errors.join(', ')}`);
    }
    
    // In a real implementation, this would upload the conversation to a server
    // and return a shareable URL. For now, we'll create a data URL
    const data = this.exportToJSON(messages);
    const encoded = btoa(encodeURIComponent(data));
    return `${window.location.origin}/shared/${encoded}`;
  }
}