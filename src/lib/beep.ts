/**
 * A short, dependency-free notification tone via Web Audio — no audio file to ship, and it
 * works the moment the tab is open regardless of network/CDN availability.
 *
 * This only ever covers the FOREGROUND case (the tab is open and JS is running). A service
 * worker cannot play audio at all — there is no Web Audio API inside one, and the Notification
 * API's `sound` option was never implemented by any browser and was dropped from the spec — so
 * a background push's "sound" is always just the OS/browser's own default notification chime,
 * not something this app can customize. requireInteraction + vibrate (already set on the
 * service-worker side, see backend/server.js's /firebase-messaging-sw.js) is as close as a
 * background push gets to "make sure they notice it".
 */

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** One short beep. Safe to call from anywhere in the foreground app. */
export function playBeep(frequency = 880, durationMs = 180, volume = 0.2): void {
  const audioCtx = getContext();
  if (!audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    // Quick fade-out instead of a hard stop, so it doesn't click/pop.
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
    osc.start(now);
    osc.stop(now + durationMs / 1000);
  } catch {
    /* Autoplay policy or unsupported browser — nothing sensible to do about it. */
  }
}

/** Two quick beeps — used where a single tone would be easy to miss (e.g. a new push arriving). */
export function playDoubleBeep(): void {
  playBeep(880, 150);
  window.setTimeout(() => playBeep(1046, 150), 220);
}
