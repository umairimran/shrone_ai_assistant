'use client';

import React from 'react';
import { Button } from './Button';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ThemeToggle({ className, size = 'md' }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={toggleTheme}
      className={cn('relative', className)}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      aria-pressed={isDark}
      title={`Current theme: ${isDark ? 'dark' : 'light'} mode. Click to switch to ${isDark ? 'light' : 'dark'} mode.`}
    >
      <span className="sr-only">
        {isDark ? 'Dark mode active' : 'Light mode active'}
      </span>
      {/* Sun icon for light mode */}
      <svg
        className={cn(
          'h-4 w-4 transition-all duration-300',
          isDark ? 'scale-0 rotate-90' : 'scale-100 rotate-0'
        )}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
        />
      </svg>

      {/* Moon icon for dark mode */}
      <svg
        className={cn(
          'absolute h-4 w-4 transition-all duration-300',
          isDark ? 'scale-100 rotate-0' : 'scale-0 rotate-90'
        )}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
        />
      </svg>
    </Button>
  );
}

// Dropdown version for more theme options
export function ThemeSelector({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const themes = [
    { value: 'light', label: 'Light', icon: '☀️' },
    { value: 'dark', label: 'Dark', icon: '🌙' },
    { value: 'system', label: 'System', icon: '💻' }
  ] as const;

  return (
    <div className={cn('relative', className)}>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as any)}
        className={cn(
          'appearance-none bg-transparent border border-gray-300 rounded-md',
          'px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-blue-500',
          'dark:border-gray-600 dark:bg-gray-800'
        )}
        aria-label="Select theme"
      >
        {themes.map((t) => (
          <option key={t.value} value={t.value}>
            {t.icon} {t.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700 dark:text-gray-300">
        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
        </svg>
      </div>
    </div>
  );
}