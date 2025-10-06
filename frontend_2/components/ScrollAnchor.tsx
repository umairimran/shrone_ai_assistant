'use client';

import React, { useEffect, useRef } from 'react';

interface ScrollAnchorProps {
  dependencies: unknown[];
}

export function ScrollAnchor({ dependencies }: ScrollAnchorProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, dependencies);

  return <div ref={ref} aria-hidden />;
}
