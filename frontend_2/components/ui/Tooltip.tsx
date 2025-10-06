'use client';

import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  children: ReactNode;
  content: string | ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
  disabled?: boolean;
}

export function Tooltip({
  children,
  content,
  position = 'top',
  delay = 300,
  className,
  disabled = false
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [actualPosition, setActualPosition] = useState(position);
  const timeoutRef = useRef<NodeJS.Timeout>(); // eslint-disable-line no-undef
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const showTooltip = () => {
    if (disabled) return;
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
      // Adjust position if tooltip would go off screen
      adjustPosition();
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  const adjustPosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return;
    
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let newPosition = position;
    
    // Check if tooltip goes off screen and adjust position
    switch (position) {
      case 'top':
        if (triggerRect.top - tooltipRect.height < 10) {
          newPosition = 'bottom';
        }
        break;
      case 'bottom':
        if (triggerRect.bottom + tooltipRect.height > viewportHeight - 10) {
          newPosition = 'top';
        }
        break;
      case 'left':
        if (triggerRect.left - tooltipRect.width < 10) {
          newPosition = 'right';
        }
        break;
      case 'right':
        if (triggerRect.right + tooltipRect.width > viewportWidth - 10) {
          newPosition = 'left';
        }
        break;
    }
    
    setActualPosition(newPosition);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const getPositionClasses = (pos: string) => {
    const baseClasses = 'absolute z-50 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-lg dark:bg-gray-700 pointer-events-none';
    
    switch (pos) {
      case 'top':
        return cn(baseClasses, 'bottom-full left-1/2 transform -translate-x-1/2 mb-2');
      case 'bottom':
        return cn(baseClasses, 'top-full left-1/2 transform -translate-x-1/2 mt-2');
      case 'left':
        return cn(baseClasses, 'right-full top-1/2 transform -translate-y-1/2 mr-2');
      case 'right':
        return cn(baseClasses, 'left-full top-1/2 transform -translate-y-1/2 ml-2');
      default:
        return baseClasses;
    }
  };

  const getArrowClasses = (pos: string) => {
    const baseClasses = 'absolute w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45';
    
    switch (pos) {
      case 'top':
        return cn(baseClasses, 'top-full left-1/2 transform -translate-x-1/2 -translate-y-1');
      case 'bottom':
        return cn(baseClasses, 'bottom-full left-1/2 transform -translate-x-1/2 translate-y-1');
      case 'left':
        return cn(baseClasses, 'left-full top-1/2 transform -translate-y-1/2 -translate-x-1');
      case 'right':
        return cn(baseClasses, 'right-full top-1/2 transform -translate-y-1/2 translate-x-1');
      default:
        return baseClasses;
    }
  };

  if (disabled || !content) {
    return <>{children}</>;
  }

  return (
    <div
      ref={triggerRef}
      className={cn('relative inline-block', className)}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      
      {isVisible && (
        <div
          ref={tooltipRef}
          className={getPositionClasses(actualPosition)}
          role="tooltip"
          aria-hidden={!isVisible}
        >
          {typeof content === 'string' ? (
            <span className="whitespace-nowrap">{content}</span>
          ) : (
            content
          )}
          <div className={getArrowClasses(actualPosition)} />
        </div>
      )}
    </div>
  );
}

// Hook for managing tooltip state
export function useTooltip(initialContent?: string) {
  const [content, setContent] = useState(initialContent || '');
  const [isVisible, setIsVisible] = useState(false);

  const showTooltip = (newContent?: string) => {
    if (newContent) setContent(newContent);
    setIsVisible(true);
  };

  const hideTooltip = () => {
    setIsVisible(false);
  };

  const updateContent = (newContent: string) => {
    setContent(newContent);
  };

  return {
    content,
    isVisible,
    showTooltip,
    hideTooltip,
    updateContent
  };
}