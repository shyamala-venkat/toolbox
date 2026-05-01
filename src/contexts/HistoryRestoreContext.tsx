/**
 * HistoryRestoreContext — bridge between the drawer's DetailPanel and the
 * tool component that owns the editor state.
 *
 * Why a context and not a callback prop:
 *   - The drawer is mounted by `<ToolPage>` as a sibling of the tool.
 *     Passing a callback through `<ToolPage>` would force every tool to
 *     adopt a new prop and forward it. That violates the "one ToolPage
 *     wrapper, no plumbing" rule.
 *   - The detail panel can fire a restore at any time (key shortcut,
 *     button click). The tool reads it via a hook and applies it to its
 *     local state on the next render. The hook also exposes `consume()`
 *     so the same restore is never applied twice.
 *
 * Lifecycle:
 *   1. DetailPanel calls `requestRestore({ input, params })`.
 *   2. Provider stores it in state, triggers re-render.
 *   3. Tool's `useHistoryRestore()` reads `pending`, applies it to local
 *      state in an effect, and calls `consume()` to clear it.
 *
 * Tools that aren't eligible for history still mount a no-op provider so
 * the hook is always safe to call. This keeps the integration in tool
 * components a single line regardless of eligibility.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface HistoryRestorePayload {
  input: string;
  params: unknown;
}

interface HistoryRestoreContextValue {
  /** The most recent unconsumed restore request, or null. */
  pending: HistoryRestorePayload | null;
  /** DetailPanel: schedule a restore. Only one is queued at a time; a
   *  second call before the first is consumed replaces it. */
  requestRestore: (payload: HistoryRestorePayload) => void;
  /** Tool: mark the current pending restore as applied. */
  consume: () => void;
}

const NOOP_VALUE: HistoryRestoreContextValue = {
  pending: null,
  requestRestore: () => undefined,
  consume: () => undefined,
};

const HistoryRestoreContext = createContext<HistoryRestoreContextValue>(NOOP_VALUE);

interface HistoryRestoreProviderProps {
  /** Tool id is used as the React key on the provider so switching tools
   *  resets any pending restore. Passed by ToolPage. */
  toolId: string;
  children: ReactNode;
}

export function HistoryRestoreProvider({ toolId, children }: HistoryRestoreProviderProps) {
  const [pending, setPending] = useState<HistoryRestorePayload | null>(null);

  const requestRestore = useCallback((payload: HistoryRestorePayload) => {
    setPending(payload);
  }, []);

  const consume = useCallback(() => {
    setPending(null);
  }, []);

  const value = useMemo<HistoryRestoreContextValue>(
    () => ({ pending, requestRestore, consume }),
    [pending, requestRestore, consume],
  );

  // The `key` on a child Fragment isn't legal; instead we wrap children in
  // a div keyed by toolId so unmounting fully clears descendant state. We
  // use display: contents so this wrapper is invisible to layout.
  return (
    <HistoryRestoreContext.Provider value={value}>
      <div key={toolId} style={{ display: 'contents' }}>
        {children}
      </div>
    </HistoryRestoreContext.Provider>
  );
}

/**
 * Read the pending restore (if any). The tool is responsible for calling
 * `consume()` after it has applied the restore to its local state.
 *
 * Typical usage inside a tool:
 *
 *   const { pending, consume } = useHistoryRestore();
 *   useEffect(() => {
 *     if (!pending) return;
 *     setInput(pending.input);
 *     // optionally: apply pending.params
 *     consume();
 *   }, [pending, consume]);
 */
export function useHistoryRestore(): HistoryRestoreContextValue {
  return useContext(HistoryRestoreContext);
}
