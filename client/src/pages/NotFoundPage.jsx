import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted">The page you are looking for does not exist.</p>
      <Link to="/" className="font-medium text-link underline underline-offset-4">
        Go to the home page
      </Link>
    </main>
  );
}
