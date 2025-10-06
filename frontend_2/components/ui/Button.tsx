'use client';

import React, { forwardRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'destructive';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = [
      'inline-flex items-center justify-center gap-2',
      'font-medium transition-all duration-200',
      'border border-transparent rounded-lg',
      'focus:outline-none focus:ring-2 focus:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      'select-none'
    ];

    const variants = {
      primary: [
        'bg-blue-600 text-white shadow-sm',
        'hover:bg-blue-700 hover:shadow-md',
        'focus:ring-blue-500',
        'dark:bg-blue-500 dark:hover:bg-blue-600'
      ],
      secondary: [
        'bg-white text-gray-700 border-gray-300 shadow-sm',
        'hover:bg-gray-50 hover:shadow-md',
        'focus:ring-blue-500',
        'dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600',
        'dark:hover:bg-gray-700'
      ],
      ghost: [
        'text-gray-700 bg-transparent',
        'hover:bg-gray-100 hover:text-gray-900',
        'focus:ring-blue-500',
        'dark:text-gray-200 dark:hover:bg-gray-800',
        'dark:hover:text-white'
      ],
      danger: [
        'bg-red-600 text-white shadow-sm',
        'hover:bg-red-700 hover:shadow-md',
        'focus:ring-red-500',
        'dark:bg-red-500 dark:hover:bg-red-600'
      ],
      destructive: [
        'bg-red-600 text-white shadow-sm',
        'hover:bg-red-700 hover:shadow-md',
        'focus:ring-red-500',
        'dark:bg-red-500 dark:hover:bg-red-600'
      ],
      success: [
        'bg-green-600 text-white shadow-sm',
        'hover:bg-green-700 hover:shadow-md',
        'focus:ring-green-500',
        'dark:bg-green-500 dark:hover:bg-green-600'
      ]
    };

    const sizes = {
      xs: 'px-2 py-1 text-xs min-h-[28px]',
      sm: 'px-3 py-1.5 text-sm min-h-[36px]',
      md: 'px-4 py-2 text-sm min-h-[40px]',
      lg: 'px-6 py-3 text-base min-h-[44px]'
    };

    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={cn([
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          className
        ])}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading...</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };