import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';
import { CATEGORIES, convert, formatResult, buildFormula, type UnitCategory, type UnitDef } from './units';

// ─── Persistence ───────────────────────────────────────────────────────────

interface UnitConverterDefaults {
  categoryId: string;
  fromId: string;
  toId: string;
}

const DEFAULTS: UnitConverterDefaults = {
  categoryId: 'length',
  fromId: 'mi',
  toId: 'km',
};

const sanitizeDefaults = (raw: unknown): UnitConverterDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const categoryId =
    typeof obj.categoryId === 'string' && CATEGORIES.some((c) => c.id === obj.categoryId)
      ? (obj.categoryId as string)
      : DEFAULTS.categoryId;
  const category = CATEGORIES.find((c) => c.id === categoryId)!;
  const fromId =
    typeof obj.fromId === 'string' && category.units.some((u) => u.id === obj.fromId)
      ? (obj.fromId as string)
      : category.units[0]?.id ?? DEFAULTS.fromId;
  const toId =
    typeof obj.toId === 'string' && category.units.some((u) => u.id === obj.toId)
      ? (obj.toId as string)
      : (category.units[1]?.id ?? category.units[0]?.id ?? DEFAULTS.toId);
  return { categoryId, fromId, toId };
};

// ─── Component ──────────────────────────────────────────────────────────────

function UnitConverter() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const updateStore = useSettingsStore((s) => s.update);

  const initial = useMemo(() => sanitizeDefaults(stored), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [fromId, setFromId] = useState(initial.fromId);
  const [toId, setToId] = useState(initial.toId);
  const [inputValue, setInputValue] = useState('1');

  const category: UnitCategory = useMemo(() => {
    const found = CATEGORIES.find((c) => c.id === categoryId);
    if (found) return found;
    // CATEGORIES is non-empty by construction, but TS can't verify that
    return CATEGORIES[0] as UnitCategory;
  }, [categoryId]);

  const fromUnit = useMemo(() => {
    const found = category.units.find((u) => u.id === fromId);
    return found ?? (category.units[0] as UnitDef);
  }, [category, fromId]);

  const toUnit = useMemo(() => {
    const found = category.units.find((u) => u.id === toId);
    return found ?? (category.units[1] as UnitDef | undefined) ?? (category.units[0] as UnitDef);
  }, [category, toId]);

  const result = useMemo(() => {
    const num = parseFloat(inputValue);
    if (!Number.isFinite(num)) return '';
    return formatResult(convert(num, fromUnit, toUnit));
  }, [inputValue, fromUnit, toUnit]);

  const formula = useMemo(() => buildFormula(fromUnit, toUnit), [fromUnit, toUnit]);

  // Persist selection changes
  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
    updateStore({
      toolDefaults: {
        ...allDefaults,
        [meta.id]: { categoryId, fromId, toId } satisfies UnitConverterDefaults,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, fromId, toId]);

  const handleCategoryChange = useCallback(
    (newCategoryId: string) => {
      const newCat = CATEGORIES.find((c) => c.id === newCategoryId);
      if (!newCat) return;
      setCategoryId(newCategoryId);
      setFromId(newCat.units[0]?.id ?? '');
      setToId(newCat.units[1]?.id ?? newCat.units[0]?.id ?? '');
      setInputValue('1');
    },
    [],
  );

  const handleSwap = useCallback(() => {
    setFromId(toId);
    setToId(fromId);
  }, [fromId, toId]);

  const categoryOptions = useMemo(
    () => CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
    [],
  );

  const unitOptions = useMemo(
    () => category.units.map((u) => ({ value: u.id, label: `${u.label} (${u.symbol})` })),
    [category],
  );

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* Category selector */}
        <Select
          label="Category"
          value={categoryId}
          onChange={(e) => handleCategoryChange(e.target.value)}
          options={categoryOptions}
          aria-label="Unit category"
        />

        {/* Converter panel */}
        <div
          className="flex flex-col gap-4 p-4"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {/* From row */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="Value"
                type="text"
                inputMode="decimal"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Enter value"
                aria-label="Value to convert"
              />
            </div>
            <div className="flex-1">
              <Select
                label="From"
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                options={unitOptions}
                aria-label="Convert from unit"
              />
            </div>
          </div>

          {/* Swap button */}
          <div className="flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSwap}
              aria-label="Swap from and to units"
              leadingIcon={<ArrowLeftRight className="h-4 w-4" />}
            >
              Swap
            </Button>
          </div>

          {/* To row */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="Result"
                type="text"
                value={result}
                readOnly
                placeholder="Result"
                aria-label="Conversion result"
              />
            </div>
            <div className="flex-1">
              <Select
                label="To"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                options={unitOptions}
                aria-label="Convert to unit"
              />
            </div>
          </div>
        </div>

        {/* Formula */}
        <div
          className="px-3 py-2 text-center text-sm"
          style={{
            color: 'var(--text-secondary)',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-primary)',
          }}
        >
          {formula}
        </div>
      </div>
    </ToolPage>
  );
}

export default UnitConverter;
