import { useEffect } from 'react';

/**
 * Keeps the app sized to the *visible* viewport. On iOS the on-screen keyboard shrinks the
 * visual viewport but not the layout viewport, so without this the composer would be hidden
 * behind the keyboard. Android Chrome resizes the layout viewport itself
 * (`interactive-widget=resizes-content` in index.html), where this is a harmless no-op.
 */
export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty('--app-height', `${viewport.height}px`);
        root.style.setProperty('--app-offset-top', `${viewport.offsetTop}px`);
      });
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--app-offset-top');
    };
  }, []);
}
