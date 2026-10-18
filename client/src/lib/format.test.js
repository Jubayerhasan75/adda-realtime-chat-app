import { describe, expect, it } from 'vitest';
import {
  calendarDaysBetween,
  formatDayLabel,
  formatLastSeen,
  formatListTimestamp,
  formatTime,
} from './format.js';

const LOCALE = 'en-US';
const now = new Date(2026, 9, 16, 15, 30); // Fri 16 Oct 2026, 15:30 local time

describe('calendarDaysBetween', () => {
  it('counts calendar days, not 24-hour periods', () => {
    expect(calendarDaysBetween(new Date(2026, 9, 15, 23, 59), new Date(2026, 9, 16, 0, 1))).toBe(1);
    expect(calendarDaysBetween(new Date(2026, 9, 16, 0, 1), now)).toBe(0);
  });
});

describe('formatListTimestamp', () => {
  it('shows the time for today', () => {
    expect(formatListTimestamp(new Date(2026, 9, 16, 9, 5), now, LOCALE)).toBe(
      formatTime(new Date(2026, 9, 16, 9, 5), LOCALE),
    );
  });

  it('shows Yesterday, then weekdays within the week', () => {
    expect(formatListTimestamp(new Date(2026, 9, 15, 22, 0), now, LOCALE)).toBe('Yesterday');
    expect(formatListTimestamp(new Date(2026, 9, 12, 8, 0), now, LOCALE)).toBe('Mon');
  });

  it('shows a short date for older messages and adds the year only when it differs', () => {
    expect(formatListTimestamp(new Date(2026, 8, 1), now, LOCALE)).toBe('Sep 1');
    expect(formatListTimestamp(new Date(2025, 11, 31), now, LOCALE)).toBe('Dec 31, 2025');
  });
});

describe('formatDayLabel', () => {
  it('uses Today / Yesterday / weekday / full date', () => {
    expect(formatDayLabel(new Date(2026, 9, 16, 1), now, LOCALE)).toBe('Today');
    expect(formatDayLabel(new Date(2026, 9, 15, 1), now, LOCALE)).toBe('Yesterday');
    expect(formatDayLabel(new Date(2026, 9, 13, 1), now, LOCALE)).toBe('Tuesday, October 13');
    expect(formatDayLabel(new Date(2026, 6, 4), now, LOCALE)).toBe('July 4');
    expect(formatDayLabel(new Date(2025, 6, 4), now, LOCALE)).toBe('July 4, 2025');
  });
});

describe('formatLastSeen', () => {
  it('describes recent and older activity', () => {
    const today = new Date(2026, 9, 16, 14, 5);
    expect(formatLastSeen(today, now, LOCALE)).toBe(
      `last seen today at ${formatTime(today, LOCALE)}`,
    );
    expect(formatLastSeen(new Date(2026, 8, 1), now, LOCALE)).toBe('last seen Sep 1');
  });
});
