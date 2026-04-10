import { Link } from 'react-router-dom';
import { Home as HomeIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <div
        className="mono text-5xl font-semibold"
        style={{ color: 'var(--text-muted)' }}
      >
        404
      </div>
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        Page not found
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/">
        <Button variant="primary" leadingIcon={<HomeIcon className="h-4 w-4" />}>
          Back to home
        </Button>
      </Link>
    </div>
  );
}
