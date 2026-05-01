import { useEffect, useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { useHistoryCapture } from '@/hooks/useHistoryCapture';
import { useHistoryRestore } from '@/contexts/HistoryRestoreContext';
import { meta } from './meta';
import { computeStats, formatTime } from './stats';

// ─── Stat card ─────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div
      className="flex flex-col items-center gap-1 px-4 py-3"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-primary)',
        minWidth: '120px',
      }}
    >
      <span
        className="text-2xl font-semibold tabular-nums"
        style={{ color: 'var(--text-primary)' }}
      >
        {value}
      </span>
      <span
        className="text-xs font-medium"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

function WordCounter() {
  const [input, setInput] = useState('');

  const stats = useMemo(() => computeStats(input), [input]);

  // History capture: word-counter has no separate output panel. Synthesize a
  // compact stats summary as the "output" so the history row is meaningful;
  // restore re-applies the input text.
  const synthesizedOutput =
    input.trim().length > 0
      ? [
          `Words: ${stats.words}`,
          `Characters: ${stats.characters}`,
          `Sentences: ${stats.sentences}`,
          `Paragraphs: ${stats.paragraphs}`,
          `Reading time: ${formatTime(stats.readingTimeMinutes)}`,
        ].join('\n')
      : '';
  useHistoryCapture({
    toolId: meta.id,
    input,
    output: synthesizedOutput,
    params: {},
    enabled: input.trim().length > 0,
  });

  const { pending: pendingRestore, consume: consumeRestore } = useHistoryRestore();
  useEffect(() => {
    if (!pendingRestore) return;
    setInput(pendingRestore.input);
    consumeRestore();
  }, [pendingRestore, consumeRestore]);

  return (
    <ToolPage tool={meta} fullWidth>
      <div className="flex flex-col gap-6">
        {/* Stats dashboard */}
        <div className="flex flex-wrap gap-3">
          <StatCard label="Words" value={stats.words.toLocaleString()} />
          <StatCard label="Characters" value={stats.characters.toLocaleString()} />
          <StatCard label="No Spaces" value={stats.charactersNoSpaces.toLocaleString()} />
          <StatCard label="Sentences" value={stats.sentences.toLocaleString()} />
          <StatCard label="Paragraphs" value={stats.paragraphs.toLocaleString()} />
          <StatCard label="Lines" value={stats.lines.toLocaleString()} />
          <StatCard label="Reading Time" value={formatTime(stats.readingTimeMinutes)} />
          <StatCard label="Speaking Time" value={formatTime(stats.speakingTimeMinutes)} />
        </div>

        {/* Input area */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="word-counter-input"
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Text
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setInput('')}
              disabled={input.length === 0}
            >
              Clear
            </Button>
          </div>
          <Textarea
            id="word-counter-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Start typing or paste your text here..."
            rows={20}
            spellCheck={false}
            aria-label="Text to analyze"
          />
        </div>
      </div>
    </ToolPage>
  );
}

export default WordCounter;
