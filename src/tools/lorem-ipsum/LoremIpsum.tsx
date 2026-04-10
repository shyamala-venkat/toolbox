import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { CopyButton } from '@/components/ui/CopyButton';
import { Textarea } from '@/components/ui/Textarea';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';

// ─── Types & defaults ───────────────────────────────────────────────────────

type LoremType = 'paragraphs' | 'sentences' | 'words' | 'bytes';

interface LoremIpsumDefaults {
  type: LoremType;
  count: number;
  startWithLorem: boolean;
}

const DEFAULTS: LoremIpsumDefaults = {
  type: 'paragraphs',
  count: 5,
  startWithLorem: true,
};

const MIN_COUNT = 1;
const MAX_COUNT = 100;

// Classic lorem ipsum word dictionary. Hand-picked to preserve the feel of
// the canonical text while staying compact. Duplicates are intentional —
// they bias the distribution toward the most recognizable words.
const WORDS: readonly string[] = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et',
  'dolore', 'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis',
  'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea',
  'commodo', 'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
  'velit', 'esse', 'cillum', 'eu', 'fugiat', 'nulla', 'pariatur', 'excepteur',
  'sint', 'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui',
  'officia', 'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum', 'at',
  'vero', 'eos', 'accusamus', 'accusantium', 'doloremque', 'laudantium', 'totam', 'rem',
  'aperiam', 'eaque', 'ipsa', 'quae', 'ab', 'illo', 'inventore', 'veritatis',
  'quasi', 'architecto', 'beatae', 'vitae', 'dicta', 'explicabo', 'nemo', 'ipsam',
  'quia', 'voluptas', 'aspernatur', 'aut', 'odit', 'fugit', 'consequuntur', 'magni',
  'dolores', 'ratione', 'sequi', 'nesciunt', 'neque', 'porro', 'quisquam', 'dolorem',
  'adipisci', 'numquam', 'eius', 'modi', 'tempora', 'incidunt', 'magnam', 'quaerat',
  'voluptatem', 'minus', 'quod', 'maxime', 'placeat', 'facere', 'possimus', 'omnis',
  'assumenda', 'repellendus', 'temporibus', 'autem', 'quibusdam', 'officiis', 'debitis', 'rerum',
  'necessitatibus', 'saepe', 'eveniet', 'voluptates', 'repudiandae', 'recusandae', 'itaque', 'earum',
  'hic', 'tenetur', 'sapiente', 'delectus', 'reiciendis', 'maiores', 'alias', 'perferendis',
  'doloribus', 'asperiores', 'repellat', 'quos', 'nobis', 'soluta', 'similique', 'distinctio',
];

// ─── Generator ──────────────────────────────────────────────────────────────

// Pick a random index in [0, max) using a CSPRNG and rejection sampling
// to avoid modulo bias.
const randomIndex = (max: number): number => {
  if (max <= 0) return 0;
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    crypto.getRandomValues(buf);
    const n = buf[0]!;
    if (n < limit) return n % max;
  }
};

const randomInt = (minInclusive: number, maxInclusive: number): number => {
  if (maxInclusive < minInclusive) return minInclusive;
  return minInclusive + randomIndex(maxInclusive - minInclusive + 1);
};

const capitalize = (word: string): string =>
  word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1);

const pickWord = (): string => WORDS[randomIndex(WORDS.length)]!;

const buildSentence = (): string => {
  const length = randomInt(5, 15);
  const words: string[] = [];
  for (let i = 0; i < length; i += 1) {
    words.push(pickWord());
  }
  if (words.length > 0) words[0] = capitalize(words[0]!);
  return `${words.join(' ')}.`;
};

const buildParagraph = (): string => {
  const sentences: string[] = [];
  const count = randomInt(4, 8);
  for (let i = 0; i < count; i += 1) {
    sentences.push(buildSentence());
  }
  return sentences.join(' ');
};

const LOREM_PREFIX = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';

const replacePrefixOfParagraph = (paragraph: string): string => {
  // Swap the first sentence for the canonical opener so the reader gets the
  // familiar "Lorem ipsum dolor sit amet…" cadence.
  const firstPeriod = paragraph.indexOf('.');
  if (firstPeriod === -1) return `${LOREM_PREFIX}.`;
  return `${LOREM_PREFIX}${paragraph.slice(firstPeriod)}`;
};

const replacePrefixOfSentence = (): string => `${LOREM_PREFIX}.`;

const buildParagraphs = (count: number, startWithLorem: boolean): string => {
  const paragraphs: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let p = buildParagraph();
    if (i === 0 && startWithLorem) p = replacePrefixOfParagraph(p);
    paragraphs.push(p);
  }
  return paragraphs.join('\n\n');
};

const buildSentences = (count: number, startWithLorem: boolean): string => {
  const sentences: string[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i === 0 && startWithLorem) {
      sentences.push(replacePrefixOfSentence());
    } else {
      sentences.push(buildSentence());
    }
  }
  return sentences.join(' ');
};

const buildWords = (count: number, startWithLorem: boolean): string => {
  const out: string[] = [];
  const prefix = ['lorem', 'ipsum', 'dolor', 'sit', 'amet'];
  if (startWithLorem) {
    for (let i = 0; i < Math.min(count, prefix.length); i += 1) {
      out.push(prefix[i]!);
    }
  }
  while (out.length < count) {
    out.push(pickWord());
  }
  if (out.length > 0) out[0] = capitalize(out[0]!);
  return out.join(' ');
};

const buildBytes = (targetBytes: number, startWithLorem: boolean): string => {
  // Build sentences until we're at or above the target, then truncate
  // strictly to a UTF-8 codepoint boundary so the result's byte length
  // never exceeds `targetBytes`. The previous implementation used a
  // non-fatal TextDecoder which silently emitted U+FFFD replacement chars
  // (3 bytes when re-encoded), so a slice landing mid-multibyte could
  // overshoot the requested byte count. Walking back from the cap with a
  // fatal decoder is correct because UTF-8 sequences are at most 4 bytes,
  // so we never need more than 3 retries to find a clean boundary.
  const encoder = new TextEncoder();
  let text = startWithLorem ? replacePrefixOfSentence() : buildSentence();
  while (encoder.encode(text).length < targetBytes) {
    text += ` ${buildSentence()}`;
  }
  const bytes = encoder.encode(text);
  if (bytes.length <= targetBytes) return text;
  const fatalDecoder = new TextDecoder('utf-8', { fatal: true });
  for (let end = targetBytes; end >= Math.max(0, targetBytes - 3); end -= 1) {
    try {
      return fatalDecoder.decode(bytes.slice(0, end));
    } catch {
      // Landed mid-multibyte sequence — step back one byte and retry.
    }
  }
  return '';
};

const generate = (
  type: LoremType,
  count: number,
  startWithLorem: boolean,
): string => {
  switch (type) {
    case 'paragraphs':
      return buildParagraphs(count, startWithLorem);
    case 'sentences':
      return buildSentences(count, startWithLorem);
    case 'words':
      return buildWords(count, startWithLorem);
    case 'bytes':
      return buildBytes(count, startWithLorem);
  }
};

// ─── Persistence ────────────────────────────────────────────────────────────

const isLoremType = (value: unknown): value is LoremType =>
  value === 'paragraphs' ||
  value === 'sentences' ||
  value === 'words' ||
  value === 'bytes';

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

const sanitizeLoremDefaults = (raw: unknown): LoremIpsumDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const rawCount = obj.count;
  const safeCount =
    typeof rawCount === 'number' && Number.isFinite(rawCount)
      ? clamp(Math.floor(rawCount), MIN_COUNT, MAX_COUNT)
      : DEFAULTS.count;
  return {
    type: isLoremType(obj.type) ? obj.type : DEFAULTS.type,
    count: safeCount,
    startWithLorem:
      typeof obj.startWithLorem === 'boolean'
        ? obj.startWithLorem
        : DEFAULTS.startWithLorem,
  };
};

// ─── Component ──────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'paragraphs', label: 'Paragraphs' },
  { value: 'sentences', label: 'Sentences' },
  { value: 'words', label: 'Words' },
  { value: 'bytes', label: 'Bytes' },
];

function LoremIpsum() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initial: LoremIpsumDefaults = useMemo(
    () => sanitizeLoremDefaults(stored),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [type, setType] = useState<LoremType>(initial.type);
  const [count, setCount] = useState<number>(initial.count);
  const [countInput, setCountInput] = useState<string>(String(initial.count));
  const [startWithLorem, setStartWithLorem] = useState<boolean>(initial.startWithLorem);
  const [output, setOutput] = useState<string>('');

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
        [meta.id]: { type, count, startWithLorem },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, count, startWithLorem]);

  const handleGenerate = useCallback(() => {
    const safeCount = clamp(count, MIN_COUNT, MAX_COUNT);
    setOutput(generate(type, safeCount, startWithLorem));
  }, [type, count, startWithLorem]);

  const handleCountChange = (raw: string): void => {
    setCountInput(raw);
    if (raw.trim() === '') return;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      setCount(clamp(parsed, MIN_COUNT, MAX_COUNT));
    }
  };

  const handleCountBlur = (): void => {
    const parsed = Number.parseInt(countInput, 10);
    const safe = Number.isFinite(parsed) ? clamp(parsed, MIN_COUNT, MAX_COUNT) : MIN_COUNT;
    setCount(safe);
    setCountInput(String(safe));
  };

  const unitLabel: string = (() => {
    switch (type) {
      case 'paragraphs':
        return count === 1 ? 'paragraph' : 'paragraphs';
      case 'sentences':
        return count === 1 ? 'sentence' : 'sentences';
      case 'words':
        return count === 1 ? 'word' : 'words';
      case 'bytes':
        return count === 1 ? 'byte' : 'bytes';
    }
  })();

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
      <div className="w-40">
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as LoremType)}
          options={TYPE_OPTIONS}
        />
      </div>

      <div className="w-28">
        <Input
          label="Count"
          type="number"
          inputMode="numeric"
          min={MIN_COUNT}
          max={MAX_COUNT}
          value={countInput}
          onChange={(e) => handleCountChange(e.target.value)}
          onBlur={handleCountBlur}
          aria-label={`Number of ${unitLabel} to generate`}
        />
      </div>

      <div className="flex items-center pb-2">
        <Toggle
          checked={startWithLorem}
          onChange={setStartWithLorem}
          label={'Start with "Lorem ipsum"'}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          onClick={handleGenerate}
          leadingIcon={
            output.length > 0 ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )
          }
        >
          {output.length > 0 ? 'Regenerate' : 'Generate'}
        </Button>
      </div>
    </div>
  );

  const outputPanel =
    output.length === 0 ? (
      <div
        className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-10 text-center"
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
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            No text yet
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Pick a type and click Generate.
          </p>
        </div>
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {count.toLocaleString()} {unitLabel}
            <span style={{ color: 'var(--text-tertiary)' }}>
              {' · '}
              {output.length.toLocaleString()} chars
            </span>
          </span>
          <CopyButton value={output} label="Copy" successLabel="Copied" />
        </div>
        <Textarea
          value={output}
          readOnly
          rows={14}
          spellCheck={false}
          aria-label="Generated lorem ipsum text"
        />
      </div>
    );

  return (
    <ToolPage tool={meta}>
      {optionsPanel}
      {outputPanel}
    </ToolPage>
  );
}

export default LoremIpsum;
