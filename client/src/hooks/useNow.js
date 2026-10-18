import { useEffect, useState } from 'react';

/** The current time, refreshed every `intervalMs`, for text like "last seen 5 minutes ago". */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
