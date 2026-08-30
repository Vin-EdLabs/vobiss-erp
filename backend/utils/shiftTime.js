/**
 * Pure shift-time math shared by every NOC Shift Schedule endpoint. No DB/Express imports.
 *
 * IMPORTANT: src/lib/shiftTime.ts mirrors this file's logic for the frontend (can't import
 * backend ESM across the boundary). If the crossing-midnight math here ever changes, update
 * both files.
 */

/** Combine a DATE (or Date) with a Postgres TIME string ("HH:MM:SS" or "HH:MM") into a Date. */
function combine(rosterDate, timeStr) {
  const base = rosterDate instanceof Date ? rosterDate : new Date(`${rosterDate}T00:00:00`);
  const [h, m, s] = String(timeStr).split(':').map((n) => Number(n) || 0);
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, s || 0, 0);
  return d;
}

function clockMinutes(timeStr) {
  const [h, m] = String(timeStr).split(':').map((n) => Number(n) || 0);
  return h * 60 + m;
}

/**
 * Resolves a shift definition's actual start/end Date objects for a given roster date.
 * Handles shifts that cross midnight (end clock-time <= start clock-time, e.g. Night Shift
 * 20:00 -> 08:00): the end rolls to the following calendar day.
 */
export function resolveShiftWindow(shiftDef, rosterDate) {
  const startsAt = combine(rosterDate, shiftDef.start_time);
  let endsAt = combine(rosterDate, shiftDef.end_time);
  const crossesMidnight = clockMinutes(shiftDef.end_time) <= clockMinutes(shiftDef.start_time);
  if (crossesMidnight) {
    endsAt = new Date(endsAt.getTime());
    endsAt.setDate(endsAt.getDate() + 1);
  }
  return { startsAt, endsAt, crossesMidnight };
}

/** 'active' | 'upcoming' | 'completed' for a specific roster date's shift window. */
export function computeShiftStatus(shiftDef, rosterDate, now = new Date()) {
  const { startsAt, endsAt } = resolveShiftWindow(shiftDef, rosterDate);
  if (now < startsAt) return 'upcoming';
  if (now >= endsAt) return 'completed';
  return 'active';
}

function toDateOnlyString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Given a shift definition and "now", finds which roster date's window (if any) contains
 * "now". Checks both today and yesterday because a Night Shift roster row dated yesterday
 * can still be the active shift in the early hours of today.
 */
export function findActiveRosterDate(shiftDef, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime());
  yesterday.setDate(yesterday.getDate() - 1);

  for (const candidate of [today, yesterday]) {
    const dateStr = toDateOnlyString(candidate);
    if (computeShiftStatus(shiftDef, dateStr, now) === 'active') {
      return dateStr;
    }
  }
  return null;
}

/** For a shift definition, the roster date whose window is the *next upcoming* one relative to "now". */
export function findNextRosterDate(shiftDef, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let offset = 0; offset <= 2; offset += 1) {
    const candidate = new Date(today.getTime());
    candidate.setDate(candidate.getDate() + offset);
    const dateStr = toDateOnlyString(candidate);
    if (computeShiftStatus(shiftDef, dateStr, now) === 'upcoming') {
      return dateStr;
    }
  }
  return null;
}

/** "6h 24m remaining" style string; returns null once the window has ended. */
export function formatTimeRemaining(endsAt, now = new Date()) {
  const ms = new Date(endsAt).getTime() - now.getTime();
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m remaining`;
  return `${hours}h ${minutes}m remaining`;
}

export function sortShiftDefinitions(defs) {
  return [...defs].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

export function addDaysToDateString(dateStr, offset) {
  const d = dateStr instanceof Date ? new Date(dateStr) : new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + offset);
  return toDateOnlyString(d);
}

export { toDateOnlyString };

/**
 * Builds every shift window in a [-1, +2] day range around "now" for the given shift
 * definitions, sorted chronologically. Used to resolve "current" and "next" shift generically
 * (works for any number of active shift definitions, not just Day/Night).
 */
function buildWindows(shiftDefs, now) {
  const nowDateStr = toDateOnlyString(now);
  const windows = [];
  for (const def of shiftDefs) {
    for (let offset = -1; offset <= 2; offset += 1) {
      const date = addDaysToDateString(nowDateStr, offset);
      const win = resolveShiftWindow(def, date);
      windows.push({ shiftDef: def, date, ...win });
    }
  }
  windows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return windows;
}

/**
 * Resolves the currently-active shift window (if any) and the next upcoming one, across all
 * given shift definitions. `current`/`next` are each `{shiftDef, date, startsAt, endsAt}` or null.
 */
export function getCurrentAndNextShift(shiftDefs, now = new Date()) {
  const windows = buildWindows(shiftDefs, now);
  const current = windows.find((w) => now >= w.startsAt && now < w.endsAt) || null;
  const afterBoundary = current ? current.endsAt : now;
  const next = windows.find((w) => w.startsAt > afterBoundary || (w.startsAt.getTime() === afterBoundary.getTime() && (!current || w.shiftDef.id !== current.shiftDef.id || w.date !== current.date))) || null;
  return { current, next };
}
