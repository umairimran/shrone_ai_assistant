'use client';

import { config } from '@/lib/config';

export function DebugInfo() {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black text-white p-4 rounded-lg text-xs max-w-sm">
      <h3 className="font-bold mb-2">Debug Info</h3>
      <div>Backend URL: {config.backendUrl}</div>
      <div>Environment: {process.env.NODE_ENV}</div>
      <div>NEXT_PUBLIC_BACKEND_URL: {process.env.NEXT_PUBLIC_BACKEND_URL || 'Not set'}</div>
    </div>
  );
}
