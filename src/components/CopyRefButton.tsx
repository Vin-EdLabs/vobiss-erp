import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * The one reusable "copy this reference number" control — used both next to a reference
 * number on detail pages (`size="md"`) and inline in list-table Ref No. columns on hover
 * (`size="sm"`). Always stops the click from bubbling so it never triggers a row's own
 * onClick (opening the record) when used inside a table row.
 */
export function CopyRefButton({ value, size = 'md', className = '' }: { value: string; size?: 'sm' | 'md'; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const dim = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const pad = size === 'sm' ? 'p-1' : 'p-1.5';

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={copy}
        title="Copy reference number"
        aria-label="Copy reference number"
        className={`inline-flex items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${pad} ${className}`}
      >
        {copied ? <Check className={`${dim} text-green-600`} /> : <Copy className={dim} />}
      </button>
      {copied && (
        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg animate-in fade-in">
          Copied!
        </span>
      )}
    </span>
  );
}
