import type { ReactNode } from 'react';

export interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section
      className="flex flex-col gap-5 py-8"
      style={{ borderTop: '1px solid var(--border-secondary)' }}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
        {description && (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {description}
          </p>
        )}
      </header>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}
