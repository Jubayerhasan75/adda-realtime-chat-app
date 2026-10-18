import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/http.js';

/**
 * Development-only landing page that verifies the client can reach the API and the API can
 * reach MongoDB. It is replaced by the real app shell in Phase 3.
 */
export function SystemStatusPage() {
  const readiness = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: ({ signal }) => apiRequest('/api/health/ready', { signal }),
    retry: false,
  });

  return (
    <main className="mx-auto flex h-full max-w-md flex-col justify-center gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-2xl font-semibold text-link">Adda</h1>
        <p className="text-sm text-muted">Development status — Phase 2</p>
      </header>

      <section aria-live="polite" className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-2 font-medium">System check</h2>
        {readiness.isPending && <p>Checking the server…</p>}
        {readiness.isSuccess && (
          <ul className="space-y-1">
            <li>API: {readiness.data.status}</li>
            <li>Database: {readiness.data.database}</li>
          </ul>
        )}
        {readiness.isError && (
          <div role="alert" className="space-y-2">
            <p className="text-danger">
              {readiness.error.code}: {readiness.error.message}
            </p>
            <button
              type="button"
              onClick={() => readiness.refetch()}
              className="rounded-lg bg-primary px-3 py-1.5 text-on-primary"
            >
              Try again
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
