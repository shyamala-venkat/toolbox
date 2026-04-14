import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Button } from '@/components/ui/Button';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

type DragTarget = 'start' | 'end' | null;

// ─── Constants ──────────────────────────────────────────────────────────────

const HANDLE_RADIUS = 8;
const CANVAS_MIN_HEIGHT = 400;

// ─── Component ──────────────────────────────────────────────────────────────

function ScreenRuler() {
  const canvasRef = useRef<HTMLDivElement>(null);

  const [startPoint, setStartPoint] = useState<Point>({ x: 80, y: 120 });
  const [endPoint, setEndPoint] = useState<Point>({ x: 320, y: 280 });
  const [dragging, setDragging] = useState<DragTarget>(null);
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });

  // Measurements
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const width = Math.abs(dx);
  const height = Math.abs(dy);
  const diagonal = Math.sqrt(dx * dx + dy * dy);

  // ─── Drag handlers ─────────────────────────────────────────────────────────

  const clampToCanvas = useCallback((x: number, y: number): Point => {
    const el = canvasRef.current;
    if (!el) return { x, y };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(x, rect.width)),
      y: Math.max(0, Math.min(y, rect.height)),
    };
  }, []);

  const handlePointerDown = useCallback(
    (target: DragTarget, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = canvasRef.current;
      if (!el || !target) return;

      const rect = el.getBoundingClientRect();
      const point = target === 'start' ? startPoint : endPoint;
      dragOffsetRef.current = {
        x: e.clientX - rect.left - point.x,
        y: e.clientY - rect.top - point.y,
      };
      setDragging(target);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [startPoint, endPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const el = canvasRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const raw = {
        x: e.clientX - rect.left - dragOffsetRef.current.x,
        y: e.clientY - rect.top - dragOffsetRef.current.y,
      };
      const clamped = clampToCanvas(raw.x, raw.y);

      if (dragging === 'start') {
        setStartPoint(clamped);
      } else {
        setEndPoint(clamped);
      }
    },
    [dragging, clampToCanvas],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Global escape key to cancel drag
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragging) {
        setDragging(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dragging]);

  // ─── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setStartPoint({ x: 80, y: 120 });
    setEndPoint({ x: 320, y: 280 });
    setDragging(null);
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────

  const midX = (startPoint.x + endPoint.x) / 2;
  const midY = (startPoint.y + endPoint.y) / 2;

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {/* Measurement readout */}
        <div
          className="flex flex-wrap items-center gap-6 px-4 py-3"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <MeasurementValue label="Width" value={`${width}px`} />
          <MeasurementValue label="Height" value={`${height}px`} />
          <MeasurementValue label="Diagonal" value={`${diagonal.toFixed(1)}px`} />
          <div className="ml-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              leadingIcon={<RotateCw className="h-3.5 w-3.5" />}
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Canvas area */}
        <div
          ref={canvasRef}
          role="application"
          aria-label="Pixel measurement canvas. Drag the handles to measure distances."
          className="relative select-none"
          style={{
            minHeight: `${CANVAS_MIN_HEIGHT}px`,
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            cursor: dragging ? 'grabbing' : 'default',
            touchAction: 'none',
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Grid dots for visual reference */}
          <GridDots />

          {/* Connecting dashed line */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <line
              x1={startPoint.x}
              y1={startPoint.y}
              x2={endPoint.x}
              y2={endPoint.y}
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              strokeLinecap="round"
            />
            {/* Horizontal helper line */}
            <line
              x1={startPoint.x}
              y1={startPoint.y}
              x2={endPoint.x}
              y2={startPoint.y}
              stroke="var(--text-muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.5}
            />
            {/* Vertical helper line */}
            <line
              x1={endPoint.x}
              y1={startPoint.y}
              x2={endPoint.x}
              y2={endPoint.y}
              stroke="var(--text-muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.5}
            />
          </svg>

          {/* Distance label at midpoint */}
          {diagonal > 20 && (
            <div
              className="pointer-events-none absolute flex items-center gap-1 px-2 py-1"
              style={{
                left: `${midX}px`,
                top: `${midY}px`,
                transform: 'translate(-50%, -150%)',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span
                className="text-xs font-medium tabular-nums"
                style={{ color: 'var(--accent)' }}
              >
                {diagonal.toFixed(1)}px
              </span>
            </div>
          )}

          {/* Start handle */}
          <DragHandle
            point={startPoint}
            label="Start point"
            onPointerDown={(e) => handlePointerDown('start', e)}
            isDragging={dragging === 'start'}
          />

          {/* End handle */}
          <DragHandle
            point={endPoint}
            label="End point"
            onPointerDown={(e) => handlePointerDown('end', e)}
            isDragging={dragging === 'end'}
          />

          {/* Coordinate labels */}
          <CoordinateLabel point={startPoint} label="A" />
          <CoordinateLabel point={endPoint} label="B" />
        </div>

        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Drag the handles to measure pixel distances. Coordinates are relative to the canvas area.
        </p>
      </div>
    </ToolPage>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MeasurementValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </span>
      <span
        className="text-sm font-medium tabular-nums"
        style={{ color: 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}

function DragHandle({
  point,
  label,
  onPointerDown,
  isDragging,
}: {
  point: Point;
  label: string;
  onPointerDown: (e: React.PointerEvent) => void;
  isDragging: boolean;
}) {
  return (
    <div
      role="slider"
      aria-label={label}
      aria-valuetext={`${Math.round(point.x)}, ${Math.round(point.y)}`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      className="absolute"
      style={{
        left: `${point.x - HANDLE_RADIUS}px`,
        top: `${point.y - HANDLE_RADIUS}px`,
        width: `${HANDLE_RADIUS * 2}px`,
        height: `${HANDLE_RADIUS * 2}px`,
        backgroundColor: 'var(--accent)',
        border: '2px solid var(--accent-contrast)',
        borderRadius: '50%',
        cursor: isDragging ? 'grabbing' : 'grab',
        boxShadow: isDragging ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: isDragging ? 'scale(1.2)' : 'scale(1)',
        transition: isDragging ? 'none' : 'transform 150ms, box-shadow 150ms',
        zIndex: isDragging ? 10 : 5,
      }}
    />
  );
}

function CoordinateLabel({ point, label }: { point: Point; label: string }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${point.x + HANDLE_RADIUS + 6}px`,
        top: `${point.y - 10}px`,
      }}
    >
      <span
        className="text-xs font-medium tabular-nums"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {label} ({Math.round(point.x)}, {Math.round(point.y)})
      </span>
    </div>
  );
}

function GridDots() {
  // Render a subtle dot grid purely with CSS for visual reference
  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      style={{
        backgroundImage:
          'radial-gradient(circle, var(--border-primary) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        backgroundPosition: '20px 20px',
        opacity: 0.5,
      }}
    />
  );
}

export default ScreenRuler;
