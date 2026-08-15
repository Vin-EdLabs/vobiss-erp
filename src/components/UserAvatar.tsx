import React, { useState } from 'react';
import BASE_URL from '@/lib/api';
import { cn } from '@/lib/utils';

export function publicFileSrc(path?: string | null) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  const base = String(BASE_URL || '').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

function initialsFrom(name?: string | null) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

export function UserAvatar({
  src,
  name,
  colorClass = 'bg-[var(--primary)]',
  className,
}: {
  src?: string | null;
  name?: string | null;
  colorClass?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = publicFileSrc(src);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name || ''}
        onError={() => setFailed(true)}
        className={cn('rounded-full object-cover', className)}
      />
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold text-white',
        colorClass,
        className
      )}
    >
      {initialsFrom(name)}
    </span>
  );
}
