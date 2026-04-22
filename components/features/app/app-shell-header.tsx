'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Sticky header wrapper that toggles a shadow after the page scrolls a few
 * pixels. Uses a passive scroll listener scheduled via requestAnimationFrame
 * so the handler never touches the DOM more than once per frame.
 */
export function AppShellHeader({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    function update() {
      rafRef.current = null;
      const isScrolled = window.scrollY > 4;
      setScrolled((prev) => (prev === isScrolled ? prev : isScrolled));
    }
    function onScroll() {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(update);
    }
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <header
      data-scrolled={scrolled ? 'true' : 'false'}
      className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur-sm transition-shadow duration-150 data-[scrolled=true]:shadow-card"
    >
      {children}
    </header>
  );
}
