import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Reads the one-time `?token=` from an email link once, then removes it from the address bar
 * so it doesn't stay in browser history or get shared by accident.
 */
export function useEmailLinkToken() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get('token'));

  useEffect(() => {
    if (searchParams.has('token')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
