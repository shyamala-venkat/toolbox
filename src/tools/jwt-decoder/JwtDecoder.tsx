import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  headerRaw: string;
  payloadRaw: string;
}

interface DecodeSuccess {
  kind: 'ok';
  decoded: DecodedJwt;
}

interface DecodeError {
  kind: 'error';
  message: string;
}

interface DecodeEmpty {
  kind: 'empty';
}

type DecodeResult = DecodeSuccess | DecodeError | DecodeEmpty;

// ─── Base64url helpers ──────────────────────────────────────────────────────

const base64UrlToBytes = (input: string): Uint8Array => {
  // Restore standard base64 alphabet and padding.
  const replaced = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = replaced.length % 4;
  const padded = pad === 0 ? replaced : replaced + '='.repeat(4 - pad);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) {
    throw new Error('invalid base64url characters');
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const base64UrlToJson = (input: string): Record<string, unknown> => {
  const bytes = base64UrlToBytes(input);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('segment is not a JSON object');
  }
  return parsed as Record<string, unknown>;
};

// ─── Decode ─────────────────────────────────────────────────────────────────

const decodeJwt = (raw: string): DecodeResult => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'empty' };

  const parts = trimmed.split('.');
  if (parts.length < 2 || parts.length > 3) {
    return {
      kind: 'error',
      message: 'A JWT must contain two or three dot-separated segments.',
    };
  }

  const [headerRaw, payloadRaw, signatureRaw = ''] = parts;
  if (!headerRaw || !payloadRaw) {
    return {
      kind: 'error',
      message: 'JWT header and payload segments cannot be empty.',
    };
  }

  let header: Record<string, unknown>;
  try {
    header = base64UrlToJson(headerRaw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'invalid header';
    return { kind: 'error', message: `Failed to decode header: ${reason}.` };
  }

  let payload: Record<string, unknown>;
  try {
    payload = base64UrlToJson(payloadRaw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'invalid payload';
    return { kind: 'error', message: `Failed to decode payload: ${reason}.` };
  }

  return {
    kind: 'ok',
    decoded: {
      header,
      payload,
      signature: signatureRaw,
      headerRaw,
      payloadRaw,
    },
  };
};

// ─── Claim analysis ─────────────────────────────────────────────────────────

type ExpiryKind = 'valid' | 'expired' | 'not-yet-valid' | 'no-expiry';

interface ExpiryStatus {
  kind: ExpiryKind;
  label: string;
  detail: string;
}

const REL_TIME = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const formatRelative = (targetMs: number, nowMs: number): string => {
  const diffMs = targetMs - nowMs;
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (abs < minute) return REL_TIME.format(Math.round(diffMs / 1000), 'second');
  if (abs < hour) return REL_TIME.format(Math.round(diffMs / minute), 'minute');
  if (abs < day) return REL_TIME.format(Math.round(diffMs / hour), 'hour');
  if (abs < week) return REL_TIME.format(Math.round(diffMs / day), 'day');
  if (abs < month) return REL_TIME.format(Math.round(diffMs / week), 'week');
  if (abs < year) return REL_TIME.format(Math.round(diffMs / month), 'month');
  return REL_TIME.format(Math.round(diffMs / year), 'year');
};

const analyzeExpiry = (payload: Record<string, unknown>, nowMs: number): ExpiryStatus => {
  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  const nbf = typeof payload.nbf === 'number' ? payload.nbf : null;

  if (exp === null && nbf === null) {
    return { kind: 'no-expiry', label: 'No expiry claim', detail: '' };
  }
  if (nbf !== null && nbf * 1000 > nowMs) {
    return {
      kind: 'not-yet-valid',
      label: 'Not yet valid',
      detail: `Becomes valid ${formatRelative(nbf * 1000, nowMs)}`,
    };
  }
  if (exp !== null && exp * 1000 <= nowMs) {
    return {
      kind: 'expired',
      label: 'Expired',
      detail: `Expired ${formatRelative(exp * 1000, nowMs)}`,
    };
  }
  if (exp !== null) {
    return {
      kind: 'valid',
      label: 'Valid',
      detail: `Expires ${formatRelative(exp * 1000, nowMs)}`,
    };
  }
  return { kind: 'valid', label: 'Valid', detail: 'No exp claim set' };
};

// ─── Claim row renderer ─────────────────────────────────────────────────────

interface ClaimInfo {
  key: string;
  description: string;
  renderTime?: boolean;
}

const STANDARD_CLAIMS: ClaimInfo[] = [
  { key: 'iss', description: 'Issuer' },
  { key: 'sub', description: 'Subject' },
  { key: 'aud', description: 'Audience' },
  { key: 'exp', description: 'Expires', renderTime: true },
  { key: 'nbf', description: 'Not before', renderTime: true },
  { key: 'iat', description: 'Issued at', renderTime: true },
  { key: 'jti', description: 'JWT ID' },
];

const formatAbsoluteTime = (unixSeconds: number): string => {
  try {
    return new Date(unixSeconds * 1000).toLocaleString();
  } catch {
    return String(unixSeconds);
  }
};

// ─── Component ──────────────────────────────────────────────────────────────

const JSON_INDENT = 2;

function JwtDecoder() {
  const [input, setInput] = useState<string>('');
  const debouncedInput = useDebounce(input, 100);
  const nowMs = useMemo(() => Date.now(), [debouncedInput]);

  const result = useMemo<DecodeResult>(() => decodeJwt(debouncedInput), [debouncedInput]);

  const handleClear = useCallback(() => setInput(''), []);

  const headerJson = useMemo(
    () => (result.kind === 'ok' ? JSON.stringify(result.decoded.header, null, JSON_INDENT) : ''),
    [result],
  );
  const payloadJson = useMemo(
    () => (result.kind === 'ok' ? JSON.stringify(result.decoded.payload, null, JSON_INDENT) : ''),
    [result],
  );

  const expiryStatus = useMemo<ExpiryStatus | null>(
    () => (result.kind === 'ok' ? analyzeExpiry(result.decoded.payload, nowMs) : null),
    [result, nowMs],
  );

  // ─── Sub-renders ──────────────────────────────────────────────────────────

  const inputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
          htmlFor="jwt-decoder-input"
        >
          JWT token
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
        id="jwt-decoder-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.signature"
        monospace
        spellCheck={false}
        rows={6}
        aria-label="JWT token input"
      />
      {result.kind === 'error' && (
        <div
          className="mt-1 flex items-start gap-2 p-3"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-md)',
          }}
          role="alert"
        >
          <XCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--danger)' }}
            aria-hidden="true"
          />
          <p className="text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
            {result.message}
          </p>
        </div>
      )}
    </div>
  );

  const renderJsonSection = (
    title: string,
    json: string,
    ariaLabel: string,
    accent?: 'indigo' | 'neutral',
  ) => (
    <section
      className="flex flex-col gap-2"
      aria-label={ariaLabel}
    >
      <div className="flex items-center justify-between">
        <h2
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: accent === 'indigo' ? 'var(--accent)' : 'var(--text-tertiary)',
            }}
            aria-hidden="true"
          />
          {title}
        </h2>
        <CopyButton value={json} disabled={json.length === 0} />
      </div>
      <pre
        className="mono overflow-x-auto p-3 text-xs leading-6"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
        }}
      >
        {json}
      </pre>
    </section>
  );

  const renderSignatureSection = (signature: string) => (
    <section className="flex flex-col gap-2" aria-label="Signature">
      <div className="flex items-center justify-between">
        <h2
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: 'var(--text-tertiary)' }}
            aria-hidden="true"
          />
          Signature
        </h2>
        <CopyButton value={signature} disabled={signature.length === 0} />
      </div>
      <pre
        className="mono overflow-x-auto p-3 text-xs leading-6"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
          wordBreak: 'break-all',
          whiteSpace: 'pre-wrap',
        }}
      >
        {signature.length > 0 ? signature : '(empty)'}
      </pre>
      <div
        className="flex items-start gap-2 p-3"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <ShieldAlert
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
          style={{ color: 'var(--warning)' }}
          aria-hidden="true"
        />
        <p className="text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
          Signature verification requires the issuer&apos;s secret or public key and is
          intentionally not performed locally.
        </p>
      </div>
    </section>
  );

  const renderClaimsTable = (payload: Record<string, unknown>) => {
    const rows = STANDARD_CLAIMS.filter((claim) => claim.key in payload);
    if (rows.length === 0) return null;
    return (
      <section
        className="flex flex-col gap-2"
        aria-label="Standard claims"
      >
        <h2
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-secondary)' }}
        >
          Standard claims
        </h2>
        <div
          className="overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <table className="w-full text-xs">
            <tbody>
              {rows.map((claim, idx) => {
                const rawValue = payload[claim.key];
                const display = (() => {
                  if (claim.renderTime && typeof rawValue === 'number') {
                    return `${formatAbsoluteTime(rawValue)} (${rawValue})`;
                  }
                  if (typeof rawValue === 'string' || typeof rawValue === 'number') {
                    return String(rawValue);
                  }
                  return JSON.stringify(rawValue);
                })();
                return (
                  <tr
                    key={claim.key}
                    style={{
                      borderTop:
                        idx === 0 ? undefined : '1px solid var(--border-secondary)',
                    }}
                  >
                    <td
                      className="mono px-3 py-2 align-top font-semibold"
                      style={{ color: 'var(--accent)', width: '4.5rem' }}
                    >
                      {claim.key}
                    </td>
                    <td
                      className="px-3 py-2 align-top"
                      style={{ color: 'var(--text-tertiary)', width: '7rem' }}
                    >
                      {claim.description}
                    </td>
                    <td
                      className="mono px-3 py-2 align-top"
                      style={{
                        color: 'var(--text-primary)',
                        wordBreak: 'break-all',
                      }}
                    >
                      {display}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  const renderExpiryBadge = (status: ExpiryStatus) => {
    const colorByKind: Record<ExpiryKind, string> = {
      valid: 'var(--success)',
      expired: 'var(--danger)',
      'not-yet-valid': 'var(--warning)',
      'no-expiry': 'var(--text-tertiary)',
    };
    const IconByKind: Record<ExpiryKind, typeof CheckCircle2> = {
      valid: CheckCircle2,
      expired: XCircle,
      'not-yet-valid': AlertTriangle,
      'no-expiry': AlertTriangle,
    };
    const color = colorByKind[status.kind];
    const Icon = IconByKind[status.kind];
    return (
      <div
        className="flex flex-wrap items-center gap-3 px-3 py-2.5"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold"
          style={{ color }}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {status.label}
        </span>
        {status.detail && (
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {status.detail}
          </span>
        )}
      </div>
    );
  };

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {inputPanel}
        {result.kind === 'ok' && (
          <div className="flex flex-col gap-5">
            {expiryStatus && renderExpiryBadge(expiryStatus)}
            {renderJsonSection('Header', headerJson, 'Header JSON', 'indigo')}
            {renderJsonSection('Payload', payloadJson, 'Payload JSON', 'indigo')}
            {renderClaimsTable(result.decoded.payload)}
            {renderSignatureSection(result.decoded.signature)}
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default JwtDecoder;
