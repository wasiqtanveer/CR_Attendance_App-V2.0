// Web Audio API wrapper for UI sound effects (plus light haptics on Android).
// Sounds are on by default; the Profile page stores an explicit 'off'.

let audioCtx = null;
let master = null;

export const soundsEnabled = () => {
  try { return localStorage.getItem('sounds') !== 'off'; } catch { return true; }
};

export const setSoundsEnabled = (enabled) => {
  try { localStorage.setItem('sounds', enabled ? 'on' : 'off'); } catch { /* storage blocked */ }
};

const getContext = () => {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    master = audioCtx.createGain();
    master.gain.value = 0.9;
    master.connect(audioCtx.destination);
  }
  return audioCtx;
};

// Mobile browsers (iOS Safari especially) only allow audio to start inside a
// user gesture. Unlock the context on the first touch/click/key and play a
// silent buffer so later, non-gesture sounds are allowed too.
const unlock = () => {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
  if (ctx.state === 'running') {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    window.removeEventListener('touchend', unlock, true);
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('touchend', unlock, true);
}

// tones: [{ freq, to?, at, dur, type?, gain? }]
const play = (tones, vibrate) => {
  if (!soundsEnabled()) return;
  if (vibrate && navigator.vibrate) {
    try { navigator.vibrate(vibrate); } catch { /* unsupported */ }
  }
  const ctx = getContext();
  if (!ctx) return;
  const schedule = () => {
    const now = ctx.currentTime + 0.005;
    tones.forEach(({ freq, to, at = 0, dur, type = 'triangle', gain = 0.3 }) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + at);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, now + at + dur);
      env.gain.setValueAtTime(0.0001, now + at);
      env.gain.exponentialRampToValueAtTime(gain, now + at + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
      osc.connect(env);
      env.connect(master);
      osc.start(now + at);
      osc.stop(now + at + dur + 0.02);
    });
  };
  try {
    if (ctx.state === 'running') schedule();
    else ctx.resume().then(schedule).catch(() => {});
  } catch (e) {
    console.warn('Audio play error:', e);
  }
};

// Bright, short tick: generic confirm / marked present.
export const playClick = () => play([{ freq: 1320, to: 990, dur: 0.07, gain: 0.28 }], 8);

export const playPresent = () => play([
  { freq: 880, dur: 0.06, gain: 0.26 },
  { freq: 1320, at: 0.045, dur: 0.09, gain: 0.24 },
], 10);

export const playAbsent = () => play([{ freq: 520, to: 360, dur: 0.11, gain: 0.3 }], [6, 30, 6]);

export const playSuccess = () => play([
  { freq: 784, dur: 0.12, gain: 0.22 },
  { freq: 988, at: 0.09, dur: 0.12, gain: 0.22 },
  { freq: 1319, at: 0.18, dur: 0.22, gain: 0.24 },
], [12, 40, 12]);

export const playDelete = () => play([{ freq: 420, to: 90, dur: 0.22, gain: 0.32 }], 20);
