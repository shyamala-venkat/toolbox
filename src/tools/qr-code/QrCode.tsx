import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, QrCode as QrCodeIcon } from 'lucide-react';
import QRCode from 'qrcode';
import { ToolPage } from '@/components/tool/ToolPage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';

// ─── Types & defaults ───────────────────────────────────────────────────────

type ErrorCorrection = 'L' | 'M' | 'Q' | 'H';
type QrSize = 'sm' | 'md' | 'lg' | 'xl';

interface QrCodeDefaults {
  errorCorrection: ErrorCorrection;
  size: QrSize;
  margin: number;
}

const DEFAULTS: QrCodeDefaults = {
  errorCorrection: 'M',
  size: 'md',
  margin: 2,
};

const MIN_MARGIN = 0;
const MAX_MARGIN = 10;

const SIZE_TO_SCALE: Record<QrSize, number> = {
  sm: 5,
  md: 8,
  lg: 12,
  xl: 16,
};

const SIZE_TO_PX: Record<QrSize, number> = {
  sm: 128,
  md: 256,
  lg: 512,
  xl: 1024,
};

const SIZE_OPTIONS = [
  { value: 'sm', label: 'Small (128)' },
  { value: 'md', label: 'Medium (256)' },
  { value: 'lg', label: 'Large (512)' },
  { value: 'xl', label: 'Extra Large (1024)' },
];

const EC_OPTIONS = [
  { value: 'L', label: 'Low (7%)' },
  { value: 'M', label: 'Medium (15%)' },
  { value: 'Q', label: 'Quartile (25%)' },
  { value: 'H', label: 'High (30%)' },
];

// ─── Persistence ────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

const isErrorCorrection = (v: unknown): v is ErrorCorrection =>
  v === 'L' || v === 'M' || v === 'Q' || v === 'H';

const isQrSize = (v: unknown): v is QrSize =>
  v === 'sm' || v === 'md' || v === 'lg' || v === 'xl';

const sanitizeQrDefaults = (raw: unknown): QrCodeDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const rawMargin = obj.margin;
  const safeMargin =
    typeof rawMargin === 'number' && Number.isFinite(rawMargin)
      ? clamp(Math.floor(rawMargin), MIN_MARGIN, MAX_MARGIN)
      : DEFAULTS.margin;
  return {
    errorCorrection: isErrorCorrection(obj.errorCorrection)
      ? obj.errorCorrection
      : DEFAULTS.errorCorrection,
    size: isQrSize(obj.size) ? obj.size : DEFAULTS.size,
    margin: safeMargin,
  };
};

// Translate common qrcode.js errors into friendly messages.
const friendlyQrError = (raw: string): string => {
  const lower = raw.toLowerCase();
  if (lower.includes('data too big') || lower.includes('code length overflow')) {
    return 'Too much data for this error correction level — try lowering it or shortening the input.';
  }
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
};

// Sanitize a string for use as a download filename: strip the extension,
// trim whitespace, replace filesystem-hostile chars with underscore, and
// cap the length.
const toFilenameStem = (source: string): string => {
  const trimmed = source.trim().slice(0, 40);
  const cleaned = trimmed.replace(/[^a-zA-Z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : 'qr-code';
};

// ─── Component ──────────────────────────────────────────────────────────────

function QrCode() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);
  const showToast = useAppStore((s) => s.showToast);

  const initial: QrCodeDefaults = useMemo(
    () => sanitizeQrDefaults(stored),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [text, setText] = useState<string>('');
  const [errorCorrection, setErrorCorrection] = useState<ErrorCorrection>(
    initial.errorCorrection,
  );
  const [size, setSize] = useState<QrSize>(initial.size);
  const [margin, setMargin] = useState<number>(initial.margin);
  const [marginInput, setMarginInput] = useState<string>(String(initial.margin));

  const [dataUrl, setDataUrl] = useState<string>('');
  const [svgString, setSvgString] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<boolean>(false);

  const debouncedText = useDebounce(text, 300);
  const epochRef = useRef(0);

  // Persist after first render.
  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
    update({
      toolDefaults: {
        ...allDefaults,
        [meta.id]: { errorCorrection, size, margin },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorCorrection, size, margin]);

  // Regenerate whenever inputs change.
  useEffect(() => {
    const trimmed = debouncedText;
    if (trimmed.length === 0) {
      setDataUrl('');
      setSvgString('');
      setError(null);
      setGenerating(false);
      return;
    }

    const myEpoch = ++epochRef.current;
    setGenerating(true);
    setError(null);

    const run = async (): Promise<void> => {
      try {
        const [png, svg] = await Promise.all([
          QRCode.toDataURL(trimmed, {
            errorCorrectionLevel: errorCorrection,
            margin,
            scale: SIZE_TO_SCALE[size],
          }),
          QRCode.toString(trimmed, {
            type: 'svg',
            errorCorrectionLevel: errorCorrection,
            margin,
          }),
        ]);
        if (epochRef.current !== myEpoch) return;
        setDataUrl(png);
        setSvgString(svg);
        setError(null);
      } catch (err) {
        if (epochRef.current !== myEpoch) return;
        const raw = err instanceof Error ? err.message : String(err);
        setDataUrl('');
        setSvgString('');
        setError(friendlyQrError(raw));
      } finally {
        if (epochRef.current === myEpoch) setGenerating(false);
      }
    };

    void run();
  }, [debouncedText, errorCorrection, size, margin]);

  const handleMarginChange = (raw: string): void => {
    setMarginInput(raw);
    if (raw.trim() === '') return;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      setMargin(clamp(parsed, MIN_MARGIN, MAX_MARGIN));
    }
  };

  const handleMarginBlur = (): void => {
    const parsed = Number.parseInt(marginInput, 10);
    const safe = Number.isFinite(parsed) ? clamp(parsed, MIN_MARGIN, MAX_MARGIN) : MIN_MARGIN;
    setMargin(safe);
    setMarginInput(String(safe));
  };

  const triggerDownload = useCallback((href: string, filename: string): void => {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleDownloadPng = useCallback(() => {
    if (!dataUrl) return;
    try {
      triggerDownload(dataUrl, `${toFilenameStem(text)}.png`);
    } catch {
      showToast('Could not download PNG', 'error');
    }
  }, [dataUrl, text, triggerDownload, showToast]);

  const handleDownloadSvg = useCallback(() => {
    if (!svgString) return;
    let objectUrl: string | null = null;
    try {
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, `${toFilenameStem(text)}.svg`);
    } catch {
      showToast('Could not download SVG', 'error');
    } finally {
      // Release the object URL after a short delay — downloads need the URL
      // alive long enough for the browser to start the fetch.
      if (objectUrl) {
        const url = objectUrl;
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
  }, [svgString, text, triggerDownload, showToast]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const optionsPanel = (
    <div
      className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-4 px-4 py-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="w-48">
        <Select
          label="Error correction"
          value={errorCorrection}
          onChange={(e) => setErrorCorrection(e.target.value as ErrorCorrection)}
          options={EC_OPTIONS}
        />
      </div>
      <div className="w-44">
        <Select
          label="Size"
          value={size}
          onChange={(e) => setSize(e.target.value as QrSize)}
          options={SIZE_OPTIONS}
        />
      </div>
      <div className="w-24">
        <Input
          label="Margin"
          type="number"
          inputMode="numeric"
          min={MIN_MARGIN}
          max={MAX_MARGIN}
          value={marginInput}
          onChange={(e) => handleMarginChange(e.target.value)}
          onBlur={handleMarginBlur}
          aria-label="QR code margin in modules"
        />
      </div>
    </div>
  );

  const inputPanel = (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="qr-code-input"
        className="text-xs font-medium"
        style={{ color: 'var(--text-secondary)' }}
      >
        Content
      </label>
      <Textarea
        id="qr-code-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type or paste text, a URL, or any content…"
        rows={6}
        spellCheck={false}
        aria-label="QR code content"
      />
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {text.length.toLocaleString()} {text.length === 1 ? 'character' : 'characters'}
      </div>
    </div>
  );

  const previewSize = SIZE_TO_PX[size];

  let resultNode: React.ReactNode;
  if (text.trim().length === 0) {
    resultNode = (
      <div
        className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-10 text-center"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px dashed var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div
          className="flex h-10 w-10 items-center justify-center"
          style={{
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--accent)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <QrCodeIcon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            No QR code yet
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Enter some text above to generate.
          </p>
        </div>
      </div>
    );
  } else if (error) {
    resultNode = (
      <div
        className="flex items-start gap-3 px-4 py-4"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--danger)',
          borderRadius: 'var(--radius-md)',
        }}
        role="alert"
      >
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{ color: 'var(--danger)' }}
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
            Unable to generate QR code
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {error}
          </p>
        </div>
      </div>
    );
  } else {
    resultNode = (
      <div className="flex flex-col gap-4">
        <div
          className="flex items-center justify-center px-4 py-6"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            minHeight: '260px',
          }}
        >
          {dataUrl ? (
            <img
              src={dataUrl}
              alt="Generated QR code"
              width={Math.min(previewSize, 320)}
              height={Math.min(previewSize, 320)}
              style={{
                maxWidth: '100%',
                height: 'auto',
                backgroundColor: 'var(--bg-primary)',
                padding: '8px',
                borderRadius: 'var(--radius-sm)',
                imageRendering: 'pixelated',
              }}
            />
          ) : (
            <div
              className="text-xs"
              style={{ color: 'var(--text-tertiary)' }}
              aria-live="polite"
            >
              {generating ? 'Generating…' : ''}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleDownloadPng}
            disabled={!dataUrl}
            leadingIcon={<Download className="h-4 w-4" />}
          >
            PNG
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleDownloadSvg}
            disabled={!svgString}
            leadingIcon={<Download className="h-4 w-4" />}
          >
            SVG
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ToolPage tool={meta}>
      {optionsPanel}
      <div className="flex flex-col gap-6">
        {inputPanel}
        {resultNode}
      </div>
    </ToolPage>
  );
}

export default QrCode;
