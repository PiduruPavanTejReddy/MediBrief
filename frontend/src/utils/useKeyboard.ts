import { useState, useEffect } from 'react';

/**
 * Hook to detect virtual keyboard status and keyboard height across mobile devices.
 * Supports iOS Safari, Android Chrome, and WebView (Capacitor).
 */
export function useKeyboard() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);
  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let initialHeight = window.innerHeight;

    const updateKeyboardState = () => {
      let kbHeight = 0;
      let open = false;

      // 1. Modern Visual Viewport API (Chrome, Safari, Edge, Android WebView)
      if (window.visualViewport) {
        const vv = window.visualViewport;
        const diff = window.innerHeight - (vv.height + vv.offsetTop);
        if (diff > 80) {
          kbHeight = diff;
          open = true;
        }
      }

      // 2. Android resize mode fallback (window.innerHeight shrinks when keyboard opens)
      if (!open && initialHeight - window.innerHeight > 120) {
        kbHeight = initialHeight - window.innerHeight;
        open = true;
      } else if (window.innerHeight > initialHeight - 50) {
        initialHeight = Math.max(initialHeight, window.innerHeight);
      }

      setIsKeyboardOpen(open);
      setKeyboardHeight(kbHeight);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateKeyboardState);
      window.visualViewport.addEventListener('scroll', updateKeyboardState);
    }
    window.addEventListener('resize', updateKeyboardState);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateKeyboardState);
        window.visualViewport.removeEventListener('scroll', updateKeyboardState);
      }
      window.removeEventListener('resize', updateKeyboardState);
    };
  }, []);

  return { isKeyboardOpen, keyboardHeight };
}
