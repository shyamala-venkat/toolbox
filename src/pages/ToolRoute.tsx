import { Suspense } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getToolById } from '@/tools/registry';

/**
 * Dynamic route for every tool in the registry.
 *
 * Resolves `:id` against the registry and falls back to /404 if unknown.
 * Each tool component owns its own `<ToolPage>` wrapper (header, history,
 * keyboard shortcut, error boundary), so this route only adds a Suspense
 * boundary around the lazy import — wrapping in `<ToolPage>` here would
 * duplicate every one of those concerns and defeat the `fullWidth` prop.
 */
export function ToolRoute() {
  const { id } = useParams<{ id: string }>();
  const tool = id ? getToolById(id) : undefined;

  if (!tool) {
    return <Navigate to="/404" replace />;
  }

  const LazyTool = tool.component;

  return (
    <Suspense fallback={<ToolLoadingFallback />}>
      <LazyTool />
    </Suspense>
  );
}

function ToolLoadingFallback() {
  return (
    <div
      className="flex items-center justify-center py-16"
      style={{ color: 'var(--text-tertiary)' }}
    >
      <Loader2 className="h-5 w-5 tb-anim-spin" aria-hidden="true" />
      <span className="ml-3 text-sm">Loading tool…</span>
    </div>
  );
}
