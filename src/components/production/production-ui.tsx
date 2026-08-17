import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export function DetailCard({
  title,
  icon: Icon,
  children,
  className = '',
  accent = 'indigo',
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  accent?: 'indigo' | 'noc' | 'teal' | 'violet';
}) {
  const accentMap = {
    indigo: { bar: 'from-indigo-500 to-violet-400', icon: 'text-indigo-500' },
    noc: { bar: 'from-amber-400 to-orange-500', icon: 'text-amber-500' },
    teal: { bar: 'from-cyan-500 to-teal-400', icon: 'text-teal-500' },
    violet: { bar: 'from-violet-500 to-purple-400', icon: 'text-violet-500' },
  };
  const a = accentMap[accent] || accentMap.indigo;

  return (
    <section
      className={`vobiss-card relative overflow-hidden rounded-[var(--card-radius)] border bg-[var(--surface)] p-5 sm:p-6 ${className}`}
    >
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${a.bar}`} />
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
        {Icon && <Icon className={`h-5 w-5 ${a.icon}`} />}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="mb-1 text-sm text-[var(--text-muted)]">{label}</p>
      <p className="text-base font-semibold text-[var(--text-primary)]">{value?.trim() ? value : '—'}</p>
    </div>
  );
}

export function InfoGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}

const inputClass =
  'h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--accent-green-light)]';

export function FormField({
  label,
  value,
  onChange,
  type = 'text',
  required,
  className = '',
  as = 'input',
  placeholder,
  vobiField,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  className?: string;
  as?: 'input' | 'textarea';
  placeholder?: string;
  vobiField?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-sm text-[var(--text-muted)]">
        {label}
        {required && <span className="text-[var(--danger)]"> *</span>}
      </Label>
      {as === 'textarea' ? (
        <Textarea
          data-vobi-field={vobiField}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`min-h-[120px] resize-none rounded-[var(--radius-sm)] border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--text-primary)] focus:border-[var(--primary)] focus:ring-[var(--accent-green-light)] ${inputClass.replace('h-11 ', '')}`}
        />
      ) : (
        <Input
          data-vobi-field={vobiField}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </div>
  );
}

export function FormSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return <DetailCard title={title} icon={Icon}>{children}</DetailCard>;
}
