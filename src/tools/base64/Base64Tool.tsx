import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, XCircle } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { InputOutputLayout } from '@/components/tool/InputOutputLayout';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppStore } from '@/stores/appStore';
import { formatBytes } from '@/lib/utils';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type Mode = 'text' | 'file';
type Direction = 'encode' | 'decode';

interface ProcessResult {
  output: string;
  error: string | null;
}

const FILE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Base64 helpers ─────────────────────────────────────────────────────────

const bytesToBase64 = (bytes: Uint8Array): string => {
  // Build a binary-string view in chunks so we don't blow the call stack on
  // large files. 0x8000 is a comfortable chunk size.
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const base64ToBytes = (input: string): Uint8Array => {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const toUrlSafe = (b64: string): string =>
  b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const fromUrlSafe = (b64: string): string => {
  const replaced = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = replaced.length % 4;
  return pad === 0 ? replaced : replaced + '='.repeat(4 - pad);
};

const STRICT_B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const URL_SAFE_B64 = /^[A-Za-z0-9\-_]*={0,2}$/;

const encodeText = (input: string, urlSafe: boolean): ProcessResult => {
  if (input.length === 0) return { output: '', error: null };
  try {
    const bytes = new TextEncoder().encode(input);
    const b64 = bytesToBase64(bytes);
    return { output: urlSafe ? toUrlSafe(b64) : b64, error: null };
  } catch (err) {
    return {
      output: '',
      error: err instanceof Error ? err.message : 'Failed to encode input',
    };
  }
};

const decodeText = (input: string, urlSafe: boolean): ProcessResult => {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { output: '', error: null };
  // Strip whitespace inside the payload — pasted base64 often has line breaks.
  const compact = trimmed.replace(/\s+/g, '');
  const candidate = urlSafe ? fromUrlSafe(compact) : compact;
  const validator = urlSafe ? URL_SAFE_B64 : STRICT_B64;
  if (!validator.test(compact)) {
    return {
      output: '',
      error: urlSafe
        ? 'Input contains characters that are not valid URL-safe Base64.'
        : 'Input contains characters that are not valid Base64.',
    };
  }
  try {
    const bytes = base64ToBytes(candidate);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { output: text, error: null };
  } catch {
    return {
      output: '',
      error: 'Could not decode — input is not valid Base64 or not valid UTF-8 text.',
    };
  }
};

// ─── Component ──────────────────────────────────────────────────────────────

function Base64Tool() {
  const showToast = useAppStore((s) => s.showToast);

  const [mode, setMode] = useState<Mode>('text');
  const [direction, setDirection] = useState<Direction>('encode');
  const [urlSafe, setUrlSafe] = useState<boolean>(false);

  // Text mode state
  const [textInput, setTextInput] = useState<string>('');
  const debouncedTextInput = useDebounce(textInput, 150);

  // File mode state
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [fileOutput, setFileOutput] = useState<string>('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);

  // Re-process the file output when the URL-safe toggle flips.
  const [fileBytesRef, setFileBytesRef] = useState<Uint8Array | null>(null);

  useEffect(() => {
    if (!fileBytesRef) return;
    const b64 = bytesToBase64(fileBytesRef);
    setFileOutput(urlSafe ? toUrlSafe(b64) : b64);
  }, [fileBytesRef, urlSafe]);

  const textResult = useMemo<ProcessResult>(
    () =>
      direction === 'encode'
        ? encodeText(debouncedTextInput, urlSafe)
        : decodeText(debouncedTextInput, urlSafe),
    [debouncedTextInput, direction, urlSafe],
  );

  const handleSwap = useCallback(() => {
    if (mode !== 'text') return;
    // When swapping, the current OUTPUT becomes the new INPUT and we flip
    // the direction. If the current output is empty (or errored), do nothing.
    if (textResult.output.length === 0 || textResult.error) {
      setDirection((d) => (d === 'encode' ? 'decode' : 'encode'));
      return;
    }
    setTextInput(textResult.output);
    setDirection((d) => (d === 'encode' ? 'decode' : 'encode'));
  }, [mode, textResult]);

  const handleClearText = useCallback(() => setTextInput(''), []);

  const handleClearFile = useCallback(() => {
    setFileInfo(null);
    setFileOutput('');
    setFileError(null);
    setFileBytesRef(null);
  }, []);

  const handleFileDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (file.size > FILE_MAX_BYTES) {
        showToast(
          `File "${file.name}" is too large. Max ${formatBytes(FILE_MAX_BYTES)} for Base64 encoding.`,
          'warning',
        );
        return;
      }
      setIsProcessingFile(true);
      setFileError(null);
      file
        .arrayBuffer()
        .then((buffer) => {
          const bytes = new Uint8Array(buffer);
          setFileBytesRef(bytes);
          setFileInfo({ name: file.name, size: file.size });
          setIsProcessingFile(false);
        })
        .catch(() => {
          setFileError('Could not read file.');
          setIsProcessingFile(false);
        });
    },
    [showToast],
  );

  // ─── Tabs and direction toggle ────────────────────────────────────────────

  const tabs = (
    <div
      className="mb-4 inline-flex p-1"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
      role="tablist"
      aria-label="Input mode"
    >
      {(['text', 'file'] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setMode(m)}
            className="px-3 py-1 text-xs font-medium capitalize transition-colors"
            style={{
              backgroundColor: active ? 'var(--bg-primary)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
              borderRadius: 'var(--radius-sm)',
              border: active ? '1px solid var(--border-primary)' : '1px solid transparent',
            }}
          >
            {m}
          </button>
        );
      })}
    </div>
  );

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
        {(['encode', 'decode'] as const).map((d) => {
          const active = direction === d;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setDirection(d)}
              className="px-3 py-1 text-xs font-medium capitalize transition-colors"
              style={{
                backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-tertiary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {d}
            </button>
          );
        })}
      </div>

      <Toggle
        checked={urlSafe}
        onChange={setUrlSafe}
        label="URL-safe"
        description="Use - and _, drop padding"
      />

      {mode === 'text' && !textResult.error && textResult.output.length > 0 && (
        <span
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--success)' }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          OK
        </span>
      )}
    </div>
  );

  // ─── Text mode panels ─────────────────────────────────────────────────────

  const textInputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {direction === 'encode' ? 'Plain text' : 'Base64'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClearText}
          disabled={textInput.length === 0}
        >
          Clear
        </Button>
      </div>
      <Textarea
        value={textInput}
        onChange={(e) => setTextInput(e.target.value)}
        placeholder={
          direction === 'encode'
            ? 'Type or paste text to encode'
            : 'Paste a Base64 string to decode'
        }
        monospace={direction === 'decode'}
        spellCheck={false}
        rows={14}
        aria-label={direction === 'encode' ? 'Plain text input' : 'Base64 input'}
      />
    </div>
  );

  const textOutputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {direction === 'encode' ? 'Base64' : 'Plain text'}
        </span>
        <CopyButton value={textResult.output} disabled={textResult.output.length === 0} />
      </div>
      {textResult.error ? (
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
            {direction === 'encode' ? 'Encoding error' : 'Decoding error'}
          </div>
          <p className="text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
            {textResult.error}
          </p>
        </div>
      ) : (
        <Textarea
          value={textResult.output}
          readOnly
          monospace={direction === 'encode'}
          placeholder={
            direction === 'encode' ? 'Base64 output' : 'Decoded text output'
          }
          spellCheck={false}
          rows={14}
          aria-label={direction === 'encode' ? 'Base64 output' : 'Decoded text output'}
        />
      )}
    </div>
  );

  // ─── File mode ────────────────────────────────────────────────────────────

  const filePanel = (
    <div className="flex flex-col gap-4">
      {fileInfo ? (
        <div
          className="flex items-center justify-between gap-3 px-3 py-3"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <FileText
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--text-tertiary)' }}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col">
              <span
                className="truncate text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
                title={fileInfo.name}
              >
                {fileInfo.name}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {formatBytes(fileInfo.size)} · {formatBytes(fileOutput.length)} as Base64
              </span>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleClearFile}>
            Remove
          </Button>
        </div>
      ) : (
        <FileDropZone
          onDrop={handleFileDrop}
          maxSize={FILE_MAX_BYTES}
          multiple={false}
          label="Drop a file to encode"
          description={`Click to browse · Max ${formatBytes(FILE_MAX_BYTES)}`}
        />
      )}

      {fileError && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--danger)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-md)',
          }}
          role="alert"
        >
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {fileError}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Base64 output
          </span>
          <CopyButton value={fileOutput} disabled={fileOutput.length === 0} />
        </div>
        <Textarea
          value={fileOutput}
          readOnly
          monospace
          placeholder={
            isProcessingFile
              ? 'Reading file…'
              : 'Drop a file above to see its Base64 representation'
          }
          rows={16}
          aria-label="File Base64 output"
        />
      </div>
    </div>
  );

  return (
    <ToolPage tool={meta} fullWidth>
      {tabs}
      {optionsBar}
      {mode === 'text' ? (
        <InputOutputLayout
          input={textInputPanel}
          output={textOutputPanel}
          direction="horizontal"
          onSwap={handleSwap}
        />
      ) : (
        filePanel
      )}
    </ToolPage>
  );
}

export default Base64Tool;
