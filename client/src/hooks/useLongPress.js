import { useCallback, useEffect, useRef } from 'react';

const HOLD_MS = 450;
const MOVE_TOLERANCE_PX = 10;

/**
 * Long-press for touch, pen and mouse, plus right-click and the keyboard context-menu key
 * (Shift+F10 / ContextMenu fire `contextmenu`). Moving more than a few pixels cancels it, so
 * scrolling a list never triggers it, and the click that follows a long press is swallowed so
 * it doesn't also open/activate the element.
 *
 * Spread the returned handlers onto the element.
 * @param {(event: Event) => void} onLongPress
 */
export function useLongPress(onLongPress) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return {
    onPointerDown(event) {
      if (event.button !== 0) return;
      fired.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      cancel();
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        onLongPress(event);
      }, HOLD_MS);
    },
    onPointerMove(event) {
      if (!timer.current || !start.current) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu(event) {
      event.preventDefault();
      cancel();
      fired.current = true;
      onLongPress(event);
    },
    onClickCapture(event) {
      if (!fired.current) return;
      fired.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
