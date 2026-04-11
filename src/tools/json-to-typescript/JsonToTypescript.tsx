import { useCallback, useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { InputOutputLayout } from '@/components/tool/InputOutputLayout';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { XCircle } from 'lucide-react';
import { meta } from './meta';

// ─── Converter ─────────────────────────────────────────────────────────────

type OutputStyle = 'interface' | 'type';

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch: string) => ch.toUpperCase())
    .replace(/^[a-z]/, (ch) => ch.toUpperCase());
}

function getType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

interface GeneratorContext {
  interfaces: Map<string, string>;
  style: OutputStyle;
}

function generateTypeForValue(
  value: unknown,
  name: string,
  ctx: GeneratorContext,
): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';

  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';

    // Collect element types
    const elementTypes = new Set<string>();
    let objectShape: Record<string, unknown> | null = null;

    for (const item of value) {
      const t = getType(item);
      if (t === 'object' && item !== null && !Array.isArray(item)) {
        // Merge all object shapes into one
        if (objectShape === null) {
          objectShape = { ...(item as Record<string, unknown>) };
        } else {
          for (const key of Object.keys(item as Record<string, unknown>)) {
            if (!(key in objectShape)) {
              objectShape[key] = (item as Record<string, unknown>)[key];
            }
          }
        }
        elementTypes.add('__object__');
      } else {
        elementTypes.add(generateTypeForValue(item, name + 'Item', ctx));
      }
    }

    // If we have an object shape, generate an interface for it
    if (objectShape !== null) {
      const itemName = toPascalCase(name) + 'Item';
      const itemType = generateTypeForValue(objectShape, itemName, ctx);
      elementTypes.delete('__object__');
      elementTypes.add(itemType);
    }

    const types = Array.from(elementTypes);
    if (types.length === 1) return `${types[0]}[]`;
    return `(${types.join(' | ')})[]`;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const interfaceName = toPascalCase(name);
    const keys = Object.keys(obj);

    if (keys.length === 0) {
      return 'Record<string, unknown>';
    }

    const lines: string[] = [];
    for (const key of keys) {
      const propName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
      const childName = name + toPascalCase(key);
      const childType = generateTypeForValue(obj[key], childName, ctx);
      lines.push(`  ${propName}: ${childType};`);
    }

    if (ctx.style === 'interface') {
      ctx.interfaces.set(
        interfaceName,
        `export interface ${interfaceName} {\n${lines.join('\n')}\n}`,
      );
    } else {
      ctx.interfaces.set(
        interfaceName,
        `export type ${interfaceName} = {\n${lines.join('\n')}\n};`,
      );
    }

    return interfaceName;
  }

  return 'unknown';
}

function jsonToTypescript(
  jsonString: string,
  rootName: string,
  style: OutputStyle,
): { output: string; error: string | null } {
  const trimmed = jsonString.trim();
  if (trimmed.length === 0) return { output: '', error: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    return { output: '', error: message };
  }

  const ctx: GeneratorContext = {
    interfaces: new Map(),
    style,
  };

  const rootType = generateTypeForValue(parsed, rootName, ctx);

  // If the root is a primitive or array (no interface generated for root), wrap it
  if (!ctx.interfaces.has(toPascalCase(rootName))) {
    if (style === 'interface') {
      // Can't declare a primitive as interface; use type alias
      return {
        output: `export type ${toPascalCase(rootName)} = ${rootType};\n`,
        error: null,
      };
    }
    return {
      output: `export type ${toPascalCase(rootName)} = ${rootType};\n`,
      error: null,
    };
  }

  // Collect all interfaces in dependency order (deepest first, root last)
  const result: string[] = [];
  const rootKey = toPascalCase(rootName);
  for (const [key, def] of ctx.interfaces) {
    if (key !== rootKey) result.push(def);
  }
  const rootDef = ctx.interfaces.get(rootKey);
  if (rootDef) result.push(rootDef);

  return { output: result.join('\n\n') + '\n', error: null };
}

// ─── Component ─────────────────────────────────────────────────────────────

function JsonToTypescript() {
  const [input, setInput] = useState('');
  const [rootName, setRootName] = useState('Root');
  const [style, setStyle] = useState<OutputStyle>('interface');

  const debouncedInput = useDebounce(input, 200);

  const result = useMemo(
    () => jsonToTypescript(debouncedInput, rootName || 'Root', style),
    [debouncedInput, rootName, style],
  );

  const handleClear = useCallback(() => setInput(''), []);

  const isEmpty = input.trim().length === 0;
  const hasError = !isEmpty && result.error !== null;

  const optionsBar = (
    <div
      className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-3 py-3"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Root name
        </span>
        <div className="w-32">
          <Input
            value={rootName}
            onChange={(e) => setRootName(e.target.value)}
            placeholder="Root"
            aria-label="Root interface name"
          />
        </div>
      </div>

      <Toggle
        checked={style === 'type'}
        onChange={(next) => setStyle(next ? 'type' : 'interface')}
        label={style === 'type' ? 'type alias' : 'interface'}
      />
    </div>
  );

  const inputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
          htmlFor="j2t-input"
        >
          JSON input
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
        id="j2t-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder='Paste JSON here, e.g. {"name": "John", "age": 30}'
        monospace
        spellCheck={false}
        rows={18}
        aria-label="JSON input"
      />
    </div>
  );

  const outputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          TypeScript output
        </span>
        <CopyButton value={result.output} disabled={result.output.length === 0} />
      </div>
      {hasError ? (
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
            Invalid JSON
          </div>
          <p className="mono text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
            {result.error}
          </p>
        </div>
      ) : (
        <Textarea
          value={result.output}
          readOnly
          monospace
          placeholder="TypeScript definitions will appear here"
          spellCheck={false}
          rows={18}
          aria-label="TypeScript output"
        />
      )}
    </div>
  );

  return (
    <ToolPage tool={meta}>
      {optionsBar}
      <InputOutputLayout
        input={inputPanel}
        output={outputPanel}
        direction="horizontal"
      />
    </ToolPage>
  );
}

export default JsonToTypescript;
