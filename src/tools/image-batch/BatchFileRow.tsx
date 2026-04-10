import { CheckCircle2, AlertCircle, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { formatBytes } from '@/lib/utils';

export type FileStatus = 'pending' | 'processing' | 'done' | 'error';

export interface BatchFile {
  path: string;
  name: string;
  size: number;
  status: FileStatus;
  error?: string;
}

interface BatchFileRowProps {
  file: BatchFile;
  onRemove: (path: string) => void;
  disabled: boolean;
}

const STATUS_ICONS: Record<FileStatus, typeof CheckCircle2> = {
  pending: ImageIcon,
  processing: Loader2,
  done: CheckCircle2,
  error: AlertCircle,
};

const STATUS_COLORS: Record<FileStatus, string> = {
  pending: 'var(--text-tertiary)',
  processing: 'var(--accent)',
  done: 'var(--success)',
  error: 'var(--danger)',
};

export function BatchFileRow({ file, onRemove, disabled }: BatchFileRowProps) {
  const Icon = STATUS_ICONS[file.status];
  const iconColor = STATUS_COLORS[file.status];

  return (
    <div
      className="flex items-center gap-3 px-3 py-2"
      style={{
        borderBottom: '1px solid var(--border-secondary)',
      }}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-sm)',
          color: iconColor,
        }}
      >
        <Icon
          className={`h-3.5 w-3.5 ${file.status === 'processing' ? 'tb-anim-spin' : ''}`}
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }} title={file.name}>
          {file.name}
        </div>
        <div className="text-[11px]" style={{ color: file.status === 'error' ? 'var(--danger)' : 'var(--text-tertiary)' }}>
          {file.status === 'error' && file.error
            ? file.error
            : formatBytes(file.size)}
        </div>
      </div>
      {!disabled && file.status === 'pending' && (
        <button
          type="button"
          onClick={() => onRemove(file.path)}
          className="flex h-6 w-6 shrink-0 items-center justify-center transition-colors duration-150"
          style={{
            color: 'var(--text-tertiary)',
            borderRadius: 'var(--radius-sm)',
          }}
          aria-label={`Remove ${file.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
