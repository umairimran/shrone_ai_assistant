'use client';

/**
 * Telemetry Service for Citation Interaction Analytics
 * Tracks user interactions with citations for quality monitoring and UX optimization
 */

export interface CitationInteractionEvent {
  type: 'citation_click' | 'citation_copy' | 'citation_view_document' | 'citation_highlight' | 'missing_source_link';
  citationId: string;
  citationIndex: number;
  documentTitle?: string;
  pageNumber?: number;
  confidence?: number;
  timestamp: number;
  sessionId: string;
  conversationId?: string;
  userAgent: string;
}

export interface ConversationEvent {
  type: 'conversation_start' | 'conversation_export' | 'message_sent' | 'document_upload';
  timestamp: number;
  sessionId: string;
  conversationId?: string;
  metadata?: Record<string, any>;
}

export interface PerformanceEvent {
  type: 'citation_load_time' | 'document_viewer_load_time' | 'export_duration';
  duration: number;
  timestamp: number;
  sessionId: string;
  metadata?: Record<string, any>;
}

class TelemetryService {
  private sessionId: string;
  private events: Array<CitationInteractionEvent | ConversationEvent | PerformanceEvent> = [];
  private batchSize: number = 10;
  private flushInterval: number = 30000; // 30 seconds
  private flushTimer?: NodeJS.Timeout; // eslint-disable-line no-undef
  private isEnabled: boolean;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.isEnabled = typeof window !== 'undefined' && !this.isDevEnvironment();
    
    if (this.isEnabled) {
      this.startFlushTimer();
      this.setupPageUnloadHandler();
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isDevEnvironment(): boolean {
    return process.env.NODE_ENV === 'development' || // eslint-disable-line no-undef
           (typeof window !== 'undefined' && window.location.hostname === 'localhost');
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  private setupPageUnloadHandler(): void {
    if (typeof window === 'undefined') return;
    
    const handleUnload = () => {
      this.flush(true); // Force immediate flush
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
  }

  /**
   * Track citation click events
   */
  trackCitationClick(citationId: string, citationIndex: number, documentTitle?: string, confidence?: number): void {
    this.trackEvent({
      type: 'citation_click',
      citationId,
      citationIndex,
      documentTitle,
      confidence,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    });
  }

  /**
   * Track citation copy events
   */
  trackCitationCopy(citationId: string, citationIndex: number, documentTitle?: string): void {
    this.trackEvent({
      type: 'citation_copy',
      citationId,
      citationIndex,
      documentTitle,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    });
  }

  /**
   * Track document viewer interactions
   */
  trackDocumentView(citationId: string, citationIndex: number, documentTitle?: string, pageNumber?: number): void {
    this.trackEvent({
      type: 'citation_view_document',
      citationId,
      citationIndex,
      documentTitle,
      pageNumber,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    });
  }

  /**
   * Track citation highlighting events
   */
  trackCitationHighlight(citationId: string, citationIndex: number, documentTitle?: string): void {
    this.trackEvent({
      type: 'citation_highlight',
      citationId,
      citationIndex,
      documentTitle,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    });
  }

  /**
   * Track missing source link events for quality monitoring
   */
  trackMissingSourceLink(citationId: string, citationIndex: number, documentTitle?: string): void {
    this.trackEvent({
      type: 'missing_source_link',
      citationId,
      citationIndex,
      documentTitle,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    });
  }

  /**
   * Track conversation-level events
   */
  trackConversationEvent(type: ConversationEvent['type'], conversationId?: string, metadata?: Record<string, any>): void {
    this.trackEvent({
      type,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      conversationId,
      metadata
    });
  }

  /**
   * Track performance metrics
   */
  trackPerformance(type: PerformanceEvent['type'], duration: number, metadata?: Record<string, any>): void {
    this.trackEvent({
      type,
      duration,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      metadata
    });
  }

  /**
   * Generic event tracking method
   */
  private trackEvent(event: CitationInteractionEvent | ConversationEvent | PerformanceEvent): void {
    if (!this.isEnabled) {
      // Log to console in dev mode for debugging
      if (this.isDevEnvironment()) {
        console.log('📊 Telemetry Event:', event);
      }
      return;
    }

    this.events.push(event);

    // Auto-flush if batch size is reached
    if (this.events.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush events to analytics endpoint
   */
  private async flush(force: boolean = false): Promise<void> {
    if (this.events.length === 0) return;

    const eventsToSend = [...this.events];
    this.events = []; // Clear local buffer

    try {
      // In a real implementation, you would send to your analytics endpoint
      // For now, we'll use a mock implementation
      await this.sendToAnalytics(eventsToSend, force);
    } catch (error) {
      console.warn('Failed to send telemetry data:', error);
      // Re-add events to buffer if sending failed (unless forcing)
      if (!force) {
        this.events.unshift(...eventsToSend.slice(-5)); // Keep last 5 events only
      }
    }
  }

  /**
   * Mock analytics endpoint - replace with real implementation
   */
  private async sendToAnalytics(
    events: Array<CitationInteractionEvent | ConversationEvent | PerformanceEvent>,
    force: boolean = false
  ): Promise<void> {
    // Mock implementation - replace with actual API call
    const payload = {
      events,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      force,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown'
    };

    if (this.isDevEnvironment()) {
      console.log('📤 Sending telemetry batch:', payload);
      return Promise.resolve();
    }

    // In production, send to your analytics service:
    // return fetch('/api/analytics', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(payload),
    //   keepalive: force // Use keepalive for unload events
    // }).then(response => {
    //   if (!response.ok) {
    //     throw new Error(`Analytics API error: ${response.status}`);
    //   }
    // });

    // Mock delay to simulate network request
    return new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Get analytics summary for debugging
   */
  getAnalyticsSummary(): {
    sessionId: string;
    pendingEvents: number;
    isEnabled: boolean;
    environment: string;
  } {
    return {
      sessionId: this.sessionId,
      pendingEvents: this.events.length,
      isEnabled: this.isEnabled,
      environment: this.isDevEnvironment() ? 'development' : 'production'
    };
  }

  /**
   * Manually trigger flush (useful for testing)
   */
  async forceFlush(): Promise<void> {
    return this.flush(true);
  }

  /**
   * Cleanup method
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush(true); // Final flush
  }
}

// Export singleton instance
export const telemetryService = new TelemetryService();

// Export convenience methods
export const trackCitationClick = (citationId: string, citationIndex: number, documentTitle?: string, confidence?: number) =>
  telemetryService.trackCitationClick(citationId, citationIndex, documentTitle, confidence);

export const trackCitationCopy = (citationId: string, citationIndex: number, documentTitle?: string) =>
  telemetryService.trackCitationCopy(citationId, citationIndex, documentTitle);

export const trackDocumentView = (citationId: string, citationIndex: number, documentTitle?: string, pageNumber?: number) =>
  telemetryService.trackDocumentView(citationId, citationIndex, documentTitle, pageNumber);

export const trackCitationHighlight = (citationId: string, citationIndex: number, documentTitle?: string) =>
  telemetryService.trackCitationHighlight(citationId, citationIndex, documentTitle);

export const trackMissingSourceLink = (citationId: string, citationIndex: number, documentTitle?: string) =>
  telemetryService.trackMissingSourceLink(citationId, citationIndex, documentTitle);

export default telemetryService;