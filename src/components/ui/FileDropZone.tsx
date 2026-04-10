import { useRef, type ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { useFileDropzone } from '@/hooks/useFileDropzone';
import { useAppStore } from '@/stores/appStore';
import { MAX_FILE_SIZE } from '@/lib/constants';

export interface FileDropZoneProps {
  onDrop: (files: File[]) => void;
  accept?: string[];
  maxSize?: number;
  multiple?: boolean;
  label?: string;
  description?: ReactNode;
  className?: string;
}

export function FileDropZone({
  onDrop,
  accept,
  maxSize = MAX_FILE_SIZE,
  multiple = true,
  label = 'Drop files here',
  description,
  className,
}: FileDropZoneProps) {
  const showToast = useAppStore((s) => s.showToast);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isDragging, handlers } = useFileDropzone({
    onDrop,
    onReject: (reason) => showToast(reason, 'warning'),
    maxSize,
    accept,
  });

  const handleSelect = (): void => {
    inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? []);
    const accepted = files.filter((f) => {
      if (f.size > maxSize) {
        showToast(`File "${f.name}" exceeds the maximum allowed size.`, 'warning');
        return false;
      }
      return true;
    });
    if (accepted.length > 0) onDrop(accepted);
    e.target.value = '';
  };

  return (
    <div
      {...handlers}
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      }}
      className={cn(
        'flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 text-center transition-colors duration-150',
        className,
      )}
      style={{
        border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border-primary)'}`,
        backgroundColor: isDragging ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
      }}
      aria-label={label}
    >
      <Upload
        className="h-6 w-6"
        style={{ color: isDragging ? 'var(--accent)' : 'var(--text-tertiary)' }}
        aria-hidden="true"
      />
      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        {label}
      </div>
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {description ?? `Click to browse · Max ${formatBytes(maxSize)}`}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept?.join(',')}
        onChange={handleInputChange}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
