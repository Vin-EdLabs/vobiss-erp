import { PIE_COLORS } from '@/lib/chartDefaults';
import { formatGhs } from '@/lib/taxCalculations';

export const HR_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const HR_CHART_PALETTE = PIE_COLORS;

export const HR_TYPE_COLORS: Record<string, string> = {
  'full-time': 'var(--accent-green)',
  fulltime: 'var(--accent-green)',
  contract: 'var(--accent-blue)',
  'part-time': 'var(--accent-amber)',
  parttime: 'var(--accent-amber)',
};

export function typeColor(type?: string, index = 0) {
  const key = String(type || '').toLowerCase().replace(/\s+/g, '-');
  return HR_TYPE_COLORS[key] || HR_CHART_PALETTE[index % HR_CHART_PALETTE.length];
}

export function lastNMonthLabels(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: HR_MONTHS[d.getMonth()] };
  });
}

export function formatGhsTooltip(value: number) {
  return formatGhs(value);
}

export function formatCountTooltip(value: number, label = 'count') {
  return `${value} ${label}`;
}

export function formatTime12(value?: string | Date | null) {
  if (!value) return '—';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Accra' });
  }
  const text = String(value);
  if (/^\d{1,2}:\d{2}/.test(text) && !text.includes('T') && text.length <= 12) {
    const [hRaw, mRaw] = text.split(':');
    const h = Number(hRaw);
    const m = Number(mRaw);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Accra' });
}

export function formatDuration(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

export function hoursWorked(clockIn?: string | null, clockOut?: string | null, clockInTime?: string | null, clockOutTime?: string | null) {
  const start = clockInTime || clockIn;
  const end = clockOutTime || clockOut;
  if (!start || !end) return null;
  const a = new Date(start.includes('T') || start.includes('-') ? start : `1970-01-01T${String(start).slice(0, 8)}`);
  const b = new Date(end.includes('T') || end.includes('-') ? end : `1970-01-01T${String(end).slice(0, 8)}`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b <= a) return null;
  return Math.round(((b.getTime() - a.getTime()) / 3600000) * 100) / 100;
}

export function getCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not supported in this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject(new Error('Please enable location access to clock in'));
        else if (err.code === err.TIMEOUT) reject(new Error('Location timed out. Move somewhere with a clearer signal and try again.'));
        else reject(new Error('Your location is unavailable right now. Try again in a moment.'));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}
