/**
 * Frontend mirror of backend/utils/shiftTime.js's midnight-crossing math (kept intentionally
 * small — just enough to render a live-ticking "time remaining" without a network round trip
 * on every tick). If the crossing logic ever changes, update both files.
 */

export type ShiftStatus = 'active' | 'upcoming' | 'completed';

/** "6h 24m remaining" — returns null once the window has passed. */
export function formatTimeRemaining(endsAt: string | Date, now: Date = new Date()): string | null {
  const ms = new Date(endsAt).getTime() - now.getTime();
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m remaining`;
  return `${hours}h ${minutes}m remaining`;
}

export function formatShiftTimeRange(startTime: string, endTime: string): string {
  return `${formatClockTime(startTime)} – ${formatClockTime(endTime)}`;
}

export function formatClockTime(timeStr: string): string {
  const [h, m] = String(timeStr).split(':').map((n) => Number(n) || 0);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function toDateOnlyString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToDateString(dateStr: string, offset: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + offset);
  return toDateOnlyString(d);
}

export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateOnlyString(d);
}

/** Extracts "Day" or "Night" (or the whole name as a fallback) from a shift name like "Day Shift". */
export function shiftDayNight(shiftName: string): string {
  return shiftName.replace(/\s*shift\s*$/i, '').trim() || shiftName;
}
