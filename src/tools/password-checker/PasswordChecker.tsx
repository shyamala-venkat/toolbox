import { useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Input } from '@/components/ui/Input';
import { useDebounce } from '@/hooks/useDebounce';
import { meta } from './meta';

// ─── Common passwords ──────────────────────────────────────────────────────
// Top-100 list sourced from public breach aggregations (NordPass / Have I Been
// Pwned). All lowercase for comparison. DO NOT log or persist any user input.

const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '123456', 'password', '12345678', 'qwerty', '123456789', '12345', '1234',
  '111111', '1234567', 'dragon', '123123', 'baseball', 'abc123', 'football',
  'monkey', 'letmein', 'shadow', 'master', '696969', 'mustang', 'michael',
  'charlie', 'andrew', 'jessica', 'superman', 'harley', 'ranger', 'daniel',
  'starwars', 'klaster', '112233', 'george', 'computer', 'michelle', 'ashley',
  'pepper', 'thomas', 'hockey', 'hunter', 'sunshine', 'passw0rd', 'trustno1',
  'batman', 'azerty', 'iloveyou', 'princess', 'admin', 'welcome', 'login',
  '654321', 'flower', 'hello', 'charlie', 'donald', 'qwerty123', 'password1',
  'password123', 'admin123', 'letmein1', 'welcome1', 'monkey123', 'master123',
  'dragon123', 'login123', '1q2w3e4r', '1qaz2wsx', 'qazwsx', 'zaq12wsx',
  'access', 'matrix', 'whatever', 'solo', 'killer', 'jordan', 'jennifer',
  'robert', 'ginger', 'soccer', 'thunder', 'fuckyou', 'love', 'cheese',
  'nicole', 'sparky', 'joshua', 'matthew', 'olivia', 'sophia', 'qwert',
  'google', 'apple', 'samsung', 'test', 'test123', 'guest', 'guest123',
  'pass', '1234567890', '0987654321', 'zxcvbnm', 'asdfghjkl', 'qwertyuiop',
  'abcdef', 'abcdefg', 'aaaaaa', '000000',
]);

// ─── Analysis ──────────────────────────────────────────────────────────────

interface CharSetInfo {
  label: string;
  present: boolean;
  size: number;
}

interface PasswordAnalysis {
  length: number;
  charSets: CharSetInfo[];
  poolSize: number;
  entropy: number;
  crackTimes: { label: string; time: string }[];
  strength: 'weak' | 'fair' | 'good' | 'strong' | 'very strong';
  isCommon: boolean;
}

const CHAR_SETS: Array<{ label: string; pattern: RegExp; size: number }> = [
  { label: 'Lowercase (a-z)', pattern: /[a-z]/, size: 26 },
  { label: 'Uppercase (A-Z)', pattern: /[A-Z]/, size: 26 },
  { label: 'Digits (0-9)', pattern: /[0-9]/, size: 10 },
  { label: 'Symbols (!@#...)', pattern: /[^a-zA-Z0-9]/, size: 33 },
];

const formatCrackTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return 'unknown';
  if (seconds < 0.001) return 'instant';
  if (seconds < 1) return 'less than a second';
  if (seconds < 60) return `${Math.round(seconds)} second${Math.round(seconds) === 1 ? '' : 's'}`;

  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)} minute${Math.round(minutes) === 1 ? '' : 's'}`;

  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`;

  const days = hours / 24;
  if (days < 365) return `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`;

  const years = days / 365.25;
  if (years < 1e3) return `${Math.round(years)} year${Math.round(years) === 1 ? '' : 's'}`;
  if (years < 1e6) return `${(years / 1e3).toFixed(1)} thousand years`;
  if (years < 1e9) return `${(years / 1e6).toFixed(1)} million years`;
  if (years < 1e12) return `${(years / 1e9).toFixed(1)} billion years`;
  return `${(years / 1e12).toFixed(1)} trillion+ years`;
};

const analyzePassword = (password: string): PasswordAnalysis | null => {
  if (password.length === 0) return null;

  const charSets = CHAR_SETS.map((cs) => ({
    label: cs.label,
    present: cs.pattern.test(password),
    size: cs.size,
  }));

  const poolSize = charSets.reduce(
    (sum, cs) => sum + (cs.present ? cs.size : 0),
    0,
  );

  // Guard: pool of zero means no recognized characters, treat as pool=1
  const effectivePool = Math.max(poolSize, 1);
  const entropy = password.length * Math.log2(effectivePool);
  const isCommon = COMMON_PASSWORDS.has(password.toLowerCase());

  // Crack time at various attack speeds (guesses per second)
  const attackSpeeds: Array<{ label: string; gps: number }> = [
    { label: 'Online attack (100/s)', gps: 1e2 },
    { label: 'Offline slow hash (10K/s)', gps: 1e4 },
    { label: 'Offline fast hash (10B/s)', gps: 1e10 },
    { label: 'Massive GPU cluster (100B/s)', gps: 1e11 },
  ];

  // Total combinations = poolSize^length. We compute in log space to avoid
  // overflow, then convert only for the time display.
  const logCombinations = password.length * Math.log2(effectivePool);

  const crackTimes = attackSpeeds.map(({ label, gps }) => {
    // Average guesses to crack = combinations / 2
    const logSeconds = (logCombinations - 1) * Math.LN2 / Math.LN10 - Math.log10(gps);
    const seconds = Math.pow(10, logSeconds);
    return { label, time: formatCrackTime(seconds) };
  });

  let strength: PasswordAnalysis['strength'];
  if (isCommon || entropy < 25) {
    strength = 'weak';
  } else if (entropy < 40) {
    strength = 'fair';
  } else if (entropy < 60) {
    strength = 'good';
  } else if (entropy < 80) {
    strength = 'strong';
  } else {
    strength = 'very strong';
  }

  return {
    length: password.length,
    charSets,
    poolSize: effectivePool,
    entropy,
    crackTimes,
    strength,
    isCommon,
  };
};

// ─── Strength meter colors ─────────────────────────────────────────────────

const STRENGTH_CONFIG: Record<
  PasswordAnalysis['strength'],
  { label: string; color: string; segments: number }
> = {
  'weak': { label: 'Weak', color: 'var(--danger)', segments: 1 },
  'fair': { label: 'Fair', color: 'var(--warning)', segments: 2 },
  'good': { label: 'Good', color: 'var(--info)', segments: 3 },
  'strong': { label: 'Strong', color: 'var(--success)', segments: 4 },
  'very strong': { label: 'Very Strong', color: 'var(--success)', segments: 5 },
};

// ─── Component ─────────────────────────────────────────────────────────────

function PasswordChecker() {
  const [password, setPassword] = useState('');
  const debouncedPassword = useDebounce(password, 150);

  const analysis = useMemo(
    () => analyzePassword(debouncedPassword),
    [debouncedPassword],
  );

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* Input */}
        <div className="flex flex-col gap-2">
          <Input
            label="Password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter a password to check..."
            autoComplete="off"
            spellCheck={false}
            aria-label="Password to check"
          />
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Your password is never stored, logged, or transmitted.
          </p>
        </div>

        {/* Results */}
        {analysis && (
          <div className="flex flex-col gap-5">
            {/* Strength meter */}
            <div
              className="flex flex-col gap-3 p-4"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-sm font-semibold"
                  style={{ color: STRENGTH_CONFIG[analysis.strength].color }}
                >
                  {STRENGTH_CONFIG[analysis.strength].label}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {analysis.entropy.toFixed(1)} bits of entropy
                </span>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <div
                    key={i}
                    className="h-2 flex-1"
                    style={{
                      backgroundColor:
                        i < STRENGTH_CONFIG[analysis.strength].segments
                          ? STRENGTH_CONFIG[analysis.strength].color
                          : 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>

            {/* Common password warning */}
            {analysis.isCommon && (
              <div
                className="px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--danger)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--danger)',
                }}
                role="alert"
              >
                This password appears in the top-100 most common passwords list.
              </div>
            )}

            {/* Character set analysis */}
            <div
              className="flex flex-col gap-3 p-4"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <h2
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Character Sets
              </h2>
              <div className="flex flex-col gap-2">
                {analysis.charSets.map((cs) => (
                  <div
                    key={cs.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {cs.label}
                    </span>
                    <span
                      style={{
                        color: cs.present ? 'var(--success)' : 'var(--text-muted)',
                      }}
                    >
                      {cs.present ? 'Yes' : 'No'}
                    </span>
                  </div>
                ))}
              </div>
              <div
                className="flex items-center justify-between border-t pt-2 text-sm"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>Pool size</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {analysis.poolSize} characters
                </span>
              </div>
              <div
                className="flex items-center justify-between text-sm"
              >
                <span style={{ color: 'var(--text-secondary)' }}>Length</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {analysis.length} characters
                </span>
              </div>
            </div>

            {/* Estimated crack times */}
            <div
              className="flex flex-col gap-3 p-4"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <h2
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Estimated Crack Time
              </h2>
              <div className="flex flex-col gap-2">
                {analysis.crackTimes.map((ct) => (
                  <div
                    key={ct.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {ct.label}
                    </span>
                    <span
                      className="font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {ct.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!analysis && (
          <div
            className="p-4 text-center text-sm"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Enter a password above to analyze its strength.
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default PasswordChecker;
