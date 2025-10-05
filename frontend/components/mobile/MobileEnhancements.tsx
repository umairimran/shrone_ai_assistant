'use client';

import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Hook for detecting mobile devices and touch capabilities
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  return isMobile;
}

// Touch-friendly button with minimum 44px touch target
interface TouchButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
}

export function TouchButton({ 
  variant = 'primary', 
  className, 
  children, 
  ...props 
}: TouchButtonProps) {
  return (
    <button
      className={cn(
        // Ensure minimum touch target size
        'min-h-11 min-w-11 px-4 py-2',
        'inline-flex items-center justify-center gap-2',
        'font-medium rounded-lg transition-all duration-200',
        'active:scale-95 touch-manipulation',
        // Variants
        variant === 'primary' && 'bg-blue-600 text-white hover:bg-blue-700',
        variant === 'secondary' && 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100',
        variant === 'ghost' && 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// Swipeable drawer component for mobile navigation
interface SwipeableDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  children: ReactNode;
  className?: string;
}

export function SwipeableDrawer({ 
  isOpen, 
  onClose, 
  onOpen, 
  children, 
  className 
}: SwipeableDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragCurrentX, setDragCurrentX] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setDragStartX(e.touches[0].clientX);
    setDragCurrentX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const currentX = e.touches[0].clientX;
    setDragCurrentX(currentX);
    
    if (drawerRef.current) {
      const deltaX = currentX - dragStartX;
      const clampedDelta = isOpen ? Math.min(0, deltaX) : Math.max(0, deltaX);
      drawerRef.current.style.transform = `translateX(${clampedDelta}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    const deltaX = dragCurrentX - dragStartX;
    const threshold = 50; // Minimum swipe distance
    
    if (drawerRef.current) {
      drawerRef.current.style.transform = '';
    }
    
    if (isOpen && deltaX < -threshold) {
      onClose();
    } else if (!isOpen && deltaX > threshold && onOpen) {
      onOpen();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden',
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Drawer */}
      <div
        ref={drawerRef}
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-80 max-w-full transform transition-transform duration-300 lg:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          className
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full">
          <div className="h-12 w-1 bg-white/20 rounded-full" />
        </div>
        
        {children}
      </div>
    </>
  );
}

// Pull to refresh component
interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
}

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    
    const scrollTop = containerRef.current?.scrollTop || 0;
    if (scrollTop === 0) {
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || startY === 0) return;
    
    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, currentY - startY);
    
    if (distance > 0) {
      e.preventDefault();
      setIsPulling(true);
      setPullDistance(Math.min(distance, 100));
    }
  };

  const handleTouchEnd = async () => {
    if (!isMobile || !isPulling) return;
    
    setStartY(0);
    setIsPulling(false);
    
    if (pullDistance > 60) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    
    setPullDistance(0);
  };

  const refreshThreshold = pullDistance > 60;

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-auto', className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      {(isPulling || isRefreshing) && (
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center bg-gray-100 dark:bg-gray-800 transition-all duration-200"
          style={{ 
            height: isPulling ? `${pullDistance}px` : '60px',
            transform: `translateY(${isPulling ? 0 : isRefreshing ? 0 : '-100%'})`
          }}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
            {isRefreshing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
                Refreshing...
              </>
            ) : refreshThreshold ? (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l7.5-7.5 7.5 7.5m-15 6l7.5-7.5 7.5 7.5" />
                </svg>
                Release to refresh
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                </svg>
                Pull to refresh
              </>
            )}
          </div>
        </div>
      )}
      
      {/* Content */}
      <div
        style={{
          transform: isPulling ? `translateY(${pullDistance}px)` : undefined,
          transition: isPulling ? 'none' : 'transform 0.2s ease-out'
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Mobile-optimized tooltip
interface MobileTooltipProps {
  content: string;
  children: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export function MobileTooltip({ 
  content, 
  children, 
  placement = 'top' 
}: MobileTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const isMobile = useIsMobile();

  // On mobile, show tooltip on long press instead of hover
  const showTooltip = () => {
    if (isMobile) {
      setIsVisible(true);
      setTimeout(() => setIsVisible(false), 2000);
    }
  };

  return (
    <div className="relative inline-block">
      <div
        onTouchStart={showTooltip}
        onMouseEnter={() => !isMobile && setIsVisible(true)}
        onMouseLeave={() => !isMobile && setIsVisible(false)}
      >
        {children}
      </div>
      
      {isVisible && (
        <div
          className={cn(
            'absolute z-50 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded-md shadow-lg',
            'pointer-events-none whitespace-nowrap',
            placement === 'top' && 'bottom-full left-1/2 -translate-x-1/2 mb-1',
            placement === 'bottom' && 'top-full left-1/2 -translate-x-1/2 mt-1',
            placement === 'left' && 'right-full top-1/2 -translate-y-1/2 mr-1',
            placement === 'right' && 'left-full top-1/2 -translate-y-1/2 ml-1'
          )}
        >
          {content}
          {/* Arrow */}
          <div
            className={cn(
              'absolute w-2 h-2 bg-gray-900 transform rotate-45',
              placement === 'top' && 'top-full left-1/2 -translate-x-1/2 -mt-1',
              placement === 'bottom' && 'bottom-full left-1/2 -translate-x-1/2 -mb-1',
              placement === 'left' && 'left-full top-1/2 -translate-y-1/2 -ml-1',
              placement === 'right' && 'right-full top-1/2 -translate-y-1/2 -mr-1'
            )}
          />
        </div>
      )}
    </div>
  );
}