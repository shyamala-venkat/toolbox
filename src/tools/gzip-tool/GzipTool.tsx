import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownCircle, CheckCircle2, XCircle } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { InputOutputLayout } from '@/components/tool/InputOutputLayout';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { formatBytes } from '@/lib/utils';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type Direction = 'compress' | 'decompress';

interface CompressStats {
  originalBytes: number;
  compressedBytes: number;
}

type ProcessResult =
  | { kind: 'empty' }
  | { kind: 'ok'; output: string; stats: CompressStats }
  | { kind: 'error'; message: string };

// ─── Base64 helpers (shared with Base64 tool pattern) ───────────────────────

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const base64ToBytes = (input: string): Uint8Array => {
  const compact = input.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new Error('not valid base64');
  }
  const binary = atob(compact);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

// ─── CompressionStream helpers ──────────────────────────────────────────────
//
// Both `CompressionStream` and `DecompressionStream` are standard Web APIs
// (WICG) and available in modern browsers and the Tauri 2 WebKit/WebView2
// runtime. We guard the feature check at the callsite so users get a friendly
// error rather than an opaque TypeError.

const streamThrough = async (
  stream: ReadableStream<Uint8Array> | TransformStream<Uint8Array, Uint8Array>,
  bytes: Uint8Array,
): Promise<Uint8Array> => {
  const transform = stream as TransformStream<Uint8Array, Uint8Array>;
  const writer = transform.writable.getWriter();
  const chunks: Uint8Array[] = [];
  const reader = transform.readable.getReader();

  // Kick off reader loop before writing so back-pressure is respected.
  const readPromise = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  })();

  await writer.write(bytes);
  await writer.close();
  await readPromise;

  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
};

const compressText = async (text: string): Promise<Uint8Array> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CS = (globalThis as any).CompressionStream;
  if (typeof CS !== 'function') {
    throw new Error('CompressionStream is not supported in this runtime');
  }
  const bytes = new TextEncoder().encode(text);
  return streamThrough(new CS('gzip'), bytes);
};

const decompressBytes = async (bytes: Uint8Array): Promise<string> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const DS = (globalThis as any).DecompressionStream;
  if (typeof DS !== 'function') {
    throw new Error('DecompressionStream is not supported in this runtime');
  }
  const decoded = await streamThrough(new DS('gzip'), bytes);
  return new TextDecoder('utf-8', { fatal: true }).decode(decoded);
};

// ─── Component ──────────────────────────────────────────────────────────────

function GzipTool() {
  const [direction, setDirection] = useState<Direction>('compress');
  const [input, setInput] = useState<string>('');
  const [result, setResult] = useState<ProcessResult>({ kind: 'empty' });

  const debouncedInput = useDebounce(input, 200);

  // Track the current request epoch so a fast-typing user doesn't see stale
  // results when an in-flight task resolves after a newer one has started.
  const epochRef = useRef(0);

  useEffect(() => {
    if (debouncedInput.length === 0) {
      setResult({ kind: 'empty' });
      return;
    }

    const myEpoch = ++epochRef.current;

    const run = async (): Promise<void> => {
      try {
        if (direction === 'compress') {
          const originalBytes = new TextEncoder().encode(debouncedInput).byteLength;
          const compressed = await compressText(debouncedInput);
          if (epochRef.current !== myEpoch) return;
          const output = bytesToBase64(compressed);
          setResult({
            kind: 'ok',
            output,
            stats: { originalBytes, compressedBytes: compressed.byteLength },
          });
          return;
        }
        // decompress
        let bytes: Uint8Array;
        try {
          bytes = base64ToBytes(debouncedInput.trim());
        } catch {
          if (epochRef.current !== myEpoch) return;
          setResult({
            kind: 'error',
            message: 'Input is not valid base64. Paste a base64-encoded gzip payload.',
          });
          return;
        }
        const text = await decompressBytes(bytes);
        if (epochRef.current !== myEpoch) return;
        setResult({
          kind: 'ok',
          output: text,
          stats: {
            originalBytes: new TextEncoder().encode(text).byteLength,
            compressedBytes: bytes.byteLength,
          },
        });
      } catch (err) {
        if (epochRef.current !== myEpoch) return;
        const raw = err instanceof Error ? err.message : String(err);
        const friendly =
          direction === 'decompress'
            ? 'Could not decompress — input is not a valid gzip payload.'
            : `Could not compress — ${raw}`;
        setResult({ kind: 'error', message: friendly });
      }
    };

    void run();
  }, [debouncedInput, direction]);

  const handleSwap = useCallback(() => {
    // Only swap when there is a usable output to move over.
    if (result.kind !== 'ok') {
      setDirection((d) => (d === 'compress' ? 'decompress' : 'compress'));
      return;
    }
    setInput(result.output);
    setDirection((d) => (d === 'compress' ? 'decompress' : 'compress'));
  }, [result]);

  const handleClear = useCallback(() => setInput(''), []);

  // ─── Stats strip ──────────────────────────────────────────────────────────

  const statsStrip = (() => {
    if (result.kind !== 'ok') return null;
    const { originalBytes, compressedBytes } = result.stats;
    if (originalBytes === 0) return null;
    const ratio = compressedBytes / originalBytes;
    const savedPct = Math.max(0, Math.round((1 - ratio) * 100));
    const ratioPct = Math.round(ratio * 100);
    return (
      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-2 px-3 py-2.5"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Original
          <span className="mono" style={{ color: 'var(--text-primary)' }}>
            {formatBytes(originalBytes)}
          </span>
        </span>
        <ArrowDownCircle
          className="h-3.5 w-3.5"
          style={{ color: 'var(--text-tertiary)' }}
          aria-hidden="true"
        />
        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Compressed
          <span className="mono" style={{ color: 'var(--text-primary)' }}>
            {formatBytes(compressedBytes)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Ratio
          <span className="mono" style={{ color: 'var(--text-primary)' }}>
            {ratioPct}%
          </span>
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium"
          style={{ color: savedPct > 0 ? 'var(--success)' : 'var(--text-tertiary)' }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          {savedPct > 0 ? `${savedPct}% saved` : 'No savings'}
        </span>
      </div>
    );
  })();

  // ─── Options bar ──────────────────────────────────────────────────────────

  const optionsBar = (
    <div
      className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-3 py-3"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div
        className="inline-flex p-1"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
        role="radiogroup"
        aria-label="Direction"
      >
        {(
          [
            { id: 'compress', label: 'Compress' },
            { id: 'decompress', label: 'Decompress' },
          ] as const
        ).map((d) => {
          const active = direction === d.id;
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setDirection(d.id)}
              className="px-3 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-tertiary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {d.label}
            </button>
          );
        })}
      </div>
      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {direction === 'compress'
          ? 'Text → gzip → base64'
          : 'Base64 → gzip → text'}
      </span>
    </div>
  );

  // ─── Panels ───────────────────────────────────────────────────────────────

  const inputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
          htmlFor="gzip-tool-input"
        >
          {direction === 'compress' ? 'Text input' : 'Base64-encoded gzip'}
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={input.length === 0}
        >
          Clear
        </Button>
      </div>
      <Textarea
        id="gzip-tool-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={
          direction === 'compress'
            ? 'Paste text to compress'
            : 'Paste a base64-encoded gzip payload'
        }
        monospace={direction === 'decompress'}
        spellCheck={false}
        rows={12}
        aria-label={direction === 'compress' ? 'Plain text input' : 'Base64 gzip input'}
      />
    </div>
  );

  const outputValue = result.kind === 'ok' ? result.output : '';

  const outputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {direction === 'compress' ? 'Base64-encoded gzip' : 'Decompressed text'}
        </span>
        <CopyButton value={outputValue} disabled={outputValue.length === 0} />
      </div>
      {result.kind === 'error' ? (
        <div
          className="flex min-h-[120px] flex-col gap-2 p-3"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-md)',
          }}
          role="alert"
        >
          <div
            className="inline-flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: 'var(--danger)' }}
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {direction === 'compress' ? 'Compression error' : 'Decompression error'}
          </div>
          <p className="text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
            {result.message}
          </p>
        </div>
      ) : (
        <Textarea
          value={outputValue}
          readOnly
          monospace={direction === 'compress'}
          placeholder={
            direction === 'compress'
              ? 'Base64-encoded gzip will appear here'
              : 'Decompressed text will appear here'
          }
          spellCheck={false}
          rows={12}
          aria-label={direction === 'compress' ? 'Base64 gzip output' : 'Decompressed text output'}
        />
      )}
    </div>
  );

  return (
    <ToolPage tool={meta} fullWidth>
      {optionsBar}
      <div className="flex flex-col gap-4">
        {statsStrip}
        <InputOutputLayout
          input={inputPanel}
          output={outputPanel}
          direction="horizontal"
          onSwap={handleSwap}
        />
      </div>
    </ToolPage>
  );
}

export default GzipTool;
