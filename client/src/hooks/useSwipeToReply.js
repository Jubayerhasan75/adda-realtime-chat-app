import { useRef, useState } from 'react';

const DECIDE_PX = 8; // movement before deciding: swipe or scroll
const TRIGGER_PX = 56; // pull this far, then let go, to reply
const MAX_PX = 80;

/**
 * Messenger-style swipe to reply on touch screens: drag a message sideways (`direction` 1 =
 * to the right, for other people's messages; -1 = to the left, for mine) and let go past the
 * threshold. Vertical movement is left to the list (it scrolls as usual), and mouse/pen are
 * ignored (they select text; the ⋯ menu has Reply).
 *
 * @param {{ direction: 1 | -1, enabled: boolean, onReply: () => void }} options
 * @returns {{ handlers: object, offset: number, dragging: boolean, ready: boolean }}
 */
export function useSwipeToReply({ direction, enabled, onReply }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef(null);
  const swallowClick = useRef(false);

  const finish = () => {
    const current = gesture.current;
    gesture.current = null;
    setDragging(false);
    setOffset(0);
    // The tap that ends a swipe must not also open a photo or link under the finger.
    if (current?.mode === 'swipe') swallowClick.current = true;
    if (current?.mode === 'swipe' && current.reached) onReply();
  };

  const handlers = enabled
    ? {
        onPointerDown(event) {
          if (event.pointerType !== 'touch') return;
          gesture.current = { x: event.clientX, y: event.clientY, mode: null, reached: false };
        },
        onPointerMove(event) {
          const current = gesture.current;
          if (!current) return;
          const dx = (event.clientX - current.x) * direction;
          const dy = event.clientY - current.y;
          if (current.mode === null) {
            if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
            current.mode = dx > Math.abs(dy) * 1.5 ? 'swipe' : 'scroll';
            if (current.mode === 'swipe') {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              setDragging(true);
            }
          }
          if (current.mode !== 'swipe') return;
          // Follows the finger, slowing down near the end.
          const eased = dx <= TRIGGER_PX ? dx : TRIGGER_PX + (dx - TRIGGER_PX) * 0.4;
          const pulled = Math.max(0, Math.min(MAX_PX, eased));
          if (pulled >= TRIGGER_PX && !current.reached) navigator.vibrate?.(10);
          current.reached = pulled >= TRIGGER_PX;
          setOffset(pulled);
        },
        onPointerUp: finish,
        onPointerCancel: finish,
        onClickCapture(event) {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        },
      }
    : {};

  return { handlers, offset: offset * direction, dragging, ready: offset >= TRIGGER_PX };
}

/** Calls every handler of the same name (e.g. long-press and swipe on one element). */
export function mergeHandlers(...sets) {
  const merged = {};
  for (const set of sets) {
    for (const [name, handler] of Object.entries(set)) {
      const previous = merged[name];
      merged[name] = previous
        ? (event) => {
            previous(event);
            handler(event);
          }
        : handler;
    }
  }
  return merged;
}
