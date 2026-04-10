// Web Worker for safe regex execution.
//
// The main thread enforces a 5-second timeout via `worker.terminate()` so a
// catastrophic pattern (e.g. `(a+)+b` on a long input) can't freeze the UI.
// The worker has no access to DOM, network, or the filesystem — the only
// path back to the main thread is `postMessage`.

export type RegexMode = 'match' | 'replace' | 'split';

export interface RegexRequest {
  id: number;
  pattern: string;
  flags: string;
  mode: RegexMode;
  input: string;
  replacement?: string;
}

export interface MatchResult {
  match: string;
  index: number;
  groups: Record<string, string> | null;
  captures: string[];
}

export type RegexResponse =
  | { id: number; ok: true; mode: RegexMode; result: MatchResult[] | string | string[] }
  | { id: number; ok: false; error: string };

self.onmessage = (e: MessageEvent<RegexRequest>) => {
  const { id, pattern, flags, mode, input, replacement } = e.data;

  try {
    const re = new RegExp(pattern, flags);

    switch (mode) {
      case 'match': {
        let result: MatchResult[];
        if (flags.includes('g')) {
          result = Array.from(input.matchAll(re), (m) => ({
            match: m[0],
            index: m.index ?? 0,
            groups: m.groups ?? null,
            captures: Array.from(m).slice(1).map((c) => c ?? ''),
          }));
        } else {
          const m = input.match(re);
          if (m) {
            result = [
              {
                match: m[0],
                index: m.index ?? 0,
                groups: m.groups ?? null,
                captures: Array.from(m).slice(1).map((c) => c ?? ''),
              },
            ];
          } else {
            result = [];
          }
        }
        const response: RegexResponse = { id, ok: true, mode: 'match', result };
        (self as unknown as Worker).postMessage(response);
        return;
      }

      case 'replace': {
        const out = input.replace(re, replacement ?? '');
        const response: RegexResponse = { id, ok: true, mode: 'replace', result: out };
        (self as unknown as Worker).postMessage(response);
        return;
      }

      case 'split': {
        const parts = input.split(re);
        const response: RegexResponse = { id, ok: true, mode: 'split', result: parts };
        (self as unknown as Worker).postMessage(response);
        return;
      }
    }
  } catch (err) {
    const response: RegexResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
};

export {};
