/**
 * Shared chart wrapper used by every finance tool that needs a line chart.
 *
 * Built on uPlot — a small (~40 KB) canvas charting library. We deliberately
 * keep this wrapper minimal:
 *
 *   - Resolve series colors from CSS variables (`--accent`, `--info`,
 *     `--warning`, `--success`, `--danger`) so the palette tracks the active
 *     theme and accent picker. A `MutationObserver` on `<html data-theme>`
 *     bumps a key that re-mounts the canvas, which forces uPlot to rebuild
 *     with the new palette.
 *   - Resize via `ResizeObserver` so the canvas fills its container width.
 *   - Render a visually-hidden table copy of the data so AT users — and any
 *     environment without canvas support — can still read the chart.
 *   - No tooltips for v1: keeping the surface tight buys reliable theme
 *     parity. A future iteration can re-enable uPlot's cursor + legend.
 */

import { useEffect, useId, useRef, useState, type JSX } from 'react';
import uPlot, {
  type AlignedData,
  type Options as UPlotOptions,
  type Series as UPlotSeries,
} from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface ChartSeries {
  /** Legend label, also used as the table column heading. */
  label: string;
  /** y-values aligned with `xValues` (same length). */
  values: number[];
  /**
   * Optional explicit color override. When omitted the palette rotates
   * through `--accent`, `--info`, `--warning`, `--success`, `--danger`.
   */
  color?: string;
}

export interface ChartProps {
  /** x-axis values; e.g. `[1, 2, 3, ...]` for month index or year index. */
  xValues: number[];
  /** One or more y-series; all must share `xValues.length`. */
  series: ChartSeries[];
  /** Y-axis tick + accessible-table value formatter. */
  formatY?: (v: number) => string;
  /** X-axis tick + accessible-table value formatter. */
  formatX?: (v: number) => string;
  /** Accessible label for the chart. Used as `aria-label` and table caption. */
  ariaLabel: string;
  /** Pixel height of the chart area. Default 220. */
  height?: number;
  /** Show the uPlot legend below the chart. Default true. */
  showLegend?: boolean;
  /** Render an sr-only table fallback. Default true. */
  includeTable?: boolean;
}

const DEFAULT_HEIGHT = 220;
const PALETTE_VARS = [
  '--accent',
  '--info',
  '--warning',
  '--success',
  '--danger',
] as const;

/**
 * Read a CSS custom property from `:root`. We deliberately do NOT define
 * hard-coded color fallbacks here — `themes.css` declares every variable we
 * need on `:root` and on `[data-theme="dark"]`, so an empty result means a
 * test or SSR environment where we let canvas use its defaults rather than
 * pin a brand color in code.
 */
function readVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function paletteColor(index: number, override?: string): string | undefined {
  if (override) return override;
  const varName = PALETTE_VARS[index % PALETTE_VARS.length] ?? '--accent';
  const v = readVar(varName);
  return v.length > 0 ? v : undefined;
}

function defaultFormat(v: number): string {
  return Number.isFinite(v) ? String(v) : '';
}

export function Chart(props: ChartProps): JSX.Element {
  const {
    xValues,
    series,
    formatY = defaultFormat,
    formatX = defaultFormat,
    ariaLabel,
    height = DEFAULT_HEIGHT,
    showLegend = true,
    includeTable = true,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const tableId = useId();

  // Re-mount counter: bumped when the document-level theme attribute changes,
  // so the build effect tears down + rebuilds with the new palette.
  const [themeKey, setThemeKey] = useState(0);

  // Build / rebuild the uPlot instance whenever the data shape, formatters,
  // or theme changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const xCount = xValues.length;
    const hasData =
      xCount > 0 &&
      series.length > 0 &&
      series.every((s) => s.values.length === xCount);

    if (plotRef.current) {
      plotRef.current.destroy();
      plotRef.current = null;
    }

    if (!hasData) return;

    const axisColor = readVar('--text-secondary');
    const gridColor = readVar('--border-primary');
    const fontFamily =
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

    const data: AlignedData = [xValues, ...series.map((s) => s.values)];

    const seriesOpts: UPlotSeries[] = [
      // X-series: required first slot.
      { label: 'x' },
      ...series.map<UPlotSeries>((s, i) => {
        const stroke = paletteColor(i, s.color);
        const opt: UPlotSeries = {
          label: s.label,
          width: 2,
          points: { show: false },
        };
        if (stroke) opt.stroke = stroke;
        return opt;
      }),
    ];

    // Axis configs: only attach color keys when we successfully read a CSS
    // variable. Empty-string colors crash uPlot; missing keys fall back to
    // its built-in defaults, which is the right behavior for SSR / test envs.
    const buildAxis = (
      labelFormatter: (splits: number[]) => string[],
      size?: number,
    ) => {
      const axis: NonNullable<UPlotOptions['axes']>[number] = {
        font: `11px ${fontFamily}`,
        values: (_self, splits) => labelFormatter(splits),
      };
      if (axisColor) axis.stroke = axisColor;
      if (gridColor) {
        axis.grid = { stroke: gridColor, width: 1 };
        axis.ticks = { stroke: gridColor, width: 1 };
      }
      if (typeof size === 'number') axis.size = size;
      return axis;
    };

    const opts: UPlotOptions = {
      width: container.clientWidth || 640,
      height,
      legend: { show: showLegend },
      cursor: { show: false, x: false, y: false },
      scales: { x: { time: false } },
      axes: [
        buildAxis((splits) => splits.map((v) => formatX(v))),
        buildAxis((splits) => splits.map((v) => formatY(v)), 64),
      ],
      series: seriesOpts,
    };

    plotRef.current = new uPlot(opts, data, container);

    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', ariaLabel);
    if (includeTable) {
      container.setAttribute('aria-describedby', tableId);
    } else {
      container.removeAttribute('aria-describedby');
    }

    const ro = new ResizeObserver(() => {
      if (!plotRef.current || !containerRef.current) return;
      plotRef.current.setSize({
        width: containerRef.current.clientWidth || 640,
        height,
      });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (plotRef.current) {
        plotRef.current.destroy();
        plotRef.current = null;
      }
    };
  }, [
    xValues,
    series,
    formatX,
    formatY,
    ariaLabel,
    height,
    showLegend,
    includeTable,
    tableId,
    themeKey,
  ]);

  // Watch the document-level theme attribute and bump the rebuild key.
  useEffect(() => {
    const target = document.documentElement;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          setThemeKey((k) => k + 1);
        }
      }
    });
    observer.observe(target, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        ref={containerRef}
        className="w-full"
        style={{ minHeight: height }}
      />
      {includeTable && (
        <table
          id={tableId}
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
            whiteSpace: 'nowrap',
            border: 0,
            padding: 0,
            margin: '-1px',
          }}
        >
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">x</th>
              {series.map((s) => (
                <th key={s.label} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {xValues.map((x, i) => (
              <tr key={i}>
                <td>{formatX(x)}</td>
                {series.map((s) => {
                  const v = s.values[i];
                  return (
                    <td key={s.label}>
                      {typeof v === 'number' ? formatY(v) : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
