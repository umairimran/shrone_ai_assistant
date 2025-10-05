'use client';

import React, { useEffect, useState } from 'react';

interface AnnouncementProps {
  message: string;
  politeness?: 'polite' | 'assertive';
  clearAfter?: number;
}

let announcementId = 0;

export function useScreenReaderAnnouncement() {
  const [announcement, setAnnouncement] = useState<AnnouncementProps | null>(null);

  const announce = (message: string, politeness: 'polite' | 'assertive' = 'polite', clearAfter = 3000) => {
    setAnnouncement({ message, politeness, clearAfter });
    
    // Clear after specified time
    if (clearAfter > 0) {
      setTimeout(() => {
        setAnnouncement(null);
      }, clearAfter);
    }
  };

  return { announcement, announce };
}

export function ScreenReaderAnnouncer({ message, politeness = 'polite', clearAfter = 3000 }: AnnouncementProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (message) {
      setShow(true);
      
      if (clearAfter > 0) {
        const timer = setTimeout(() => {
          setShow(false);
        }, clearAfter);
        
        return () => clearTimeout(timer);
      }
    }
  }, [message, clearAfter]);

  if (!show || !message) return null;

  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}