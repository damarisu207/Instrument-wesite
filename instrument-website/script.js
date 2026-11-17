/* ================================================================
   Sound-interactive paintings
   Every element of both art pieces plays its own synthesized
   instrument when touched, and sprinkles confetti in its own color.
   ================================================================ */

// ---------- Audio setup ----------
let ctx = null;
let master = null;

function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(ctx.destination);
}

// Pentatonic scale (C major pentatonic) so everything sounds good together
const hz = (semi) => 261.63 * Math.pow(2, semi / 12);
const PENT = [0, 2, 4, 7, 9];
const note = (step, octave = 0) =>
  hz(PENT[((step % 5) + 5) % 5] + 12 * (octave + Math.floor(step / 5)));

function env(gain, t, a, peak, d) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function osc(type, freq, t, dur, peak, a = 0.005, dest = master) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  env(g, t, a, peak, dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + a + dur + 0.05);
  return o;
}

// ---------- Instruments ----------
const instruments = {
  // Bell: inharmonic partials
  bell(step) {
    const t = ctx.currentTime, f = note(step, 1);
    [1, 2.76, 5.4, 8.93].forEach((r, i) => osc('sine', f * r, t, 1.6 / (i + 1), 0.25 / (i + 1)));
  },
  // Marimba: short wooden tone
  marimba(step) {
    const t = ctx.currentTime, f = note(step, 0);
    osc('sine', f, t, 0.5, 0.5);
    osc('sine', f * 4, t, 0.12, 0.15);
  },
  // Cello-ish: sawtooth through a low-pass filter, slow attack
  cello(step) {
    const t = ctx.currentTime, f = note(step, -1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2;
    lp.connect(master);
    const o = osc('sawtooth', f, t, 1.4, 0.3, 0.08, lp);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5.5; lg.gain.value = 4;
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(t); lfo.stop(t + 1.6);
  },
  // Pluck / harp
  pluck(step) {
    const t = ctx.currentTime, f = note(step, 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + 0.6);
    lp.connect(master);
    osc('triangle', f, t, 0.9, 0.45, 0.003, lp);
    osc('sawtooth', f, t, 0.5, 0.12, 0.003, lp);
  },
  // Drum / tom: pitch-dropping sine plus a noise click
  drum() {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
    env(g, t, 0.002, 0.9, 0.4);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.5);
    noise(t, 0.04, 0.25, 2000);
  },
  // Flute: sine with breath noise and vibrato
  flute(step) {
    const t = ctx.currentTime, f = note(step, 1);
    const o = osc('sine', f, t, 0.9, 0.35, 0.06);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5; lg.gain.value = 3;
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(t); lfo.stop(t + 1);
    noise(t, 0.5, 0.05, 4000);
  },
  // Xylophone / glockenspiel: bright and short
  xylophone(step) {
    const t = ctx.currentTime, f = note(step, 2);
    osc('sine', f, t, 0.35, 0.4, 0.002);
    osc('sine', f * 3, t, 0.15, 0.2, 0.002);
  },
  // Warm pad / chord
  pad(step) {
    const t = ctx.currentTime;
    [0, 2, 4].forEach((i) => osc('triangle', note(step + i, 0), t, 1.8, 0.16, 0.15));
  },
  // Kalimba
  kalimba(step) {
    const t = ctx.currentTime, f = note(step, 1);
    osc('sine', f, t, 0.8, 0.4, 0.003);
    osc('sine', f * 6.2, t, 0.06, 0.12, 0.003);
  },
  // Soft electric piano
  epiano(step) {
    const t = ctx.currentTime, f = note(step, 0);
    osc('sine', f, t, 1.2, 0.4, 0.004);
    osc('sine', f * 2, t, 0.6, 0.15, 0.004);
    osc('triangle', f * 7, t, 0.08, 0.06, 0.002);
  },
};

function noise(t, dur, peak, cutoff) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * (dur + 0.05)));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = cutoff;
  const g = ctx.createGain();
  env(g, t, 0.005, peak, dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

// ---------- Which element plays what ----------
// [instrument, scale step] — higher/lower steps give each piece its own pitch range
const MAP = {
  // Art piece 1: the red nested squares (outer → inner gets deeper)
  'red-painting':  ['marimba', 4],
  'red-orange':    ['cello', 2],
  'burgandy':      ['cello', 0],

  // Art piece 2: the white box
  'white-box':     ['pad', 0],
  'top-box':       ['epiano', 3],
  'top-left':      ['bell', 4],
  'top-middle':    ['pluck', 5],
  'bottom-box':    ['kalimba', 2],
  'bottom-left':   ['drum', 0],
  'bottom-middle': ['flute', 2],
  'bottom-right':  ['xylophone', 3],
};

// ---------- Confetti ----------
const layer = document.createElement('div');
layer.id = 'confetti-layer';
document.body.appendChild(layer);

function parseColor(str) {
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(',').map(Number);
  return { r, g, b, a };
}

function confetti(x, y, colorStr, count = 14) {
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'confetti';
    p.style.backgroundColor = colorStr;
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    layer.appendChild(p);

    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1; // fan upward
    const speed = 60 + Math.random() * 110;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;
    const fall = 70 + Math.random() * 90;
    const spin = (Math.random() - 0.5) * 720;

    const anim = p.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.6}px, ${dy}px) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy + fall}px) rotate(${spin}deg)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)' });
    anim.onfinish = () => p.remove();
  }
}

// ---------- Wire up every element ----------
Object.keys(MAP).forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  const [inst, step] = MAP[id];

  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); // only the innermost touched section reacts
    initAudio();

    // small variation so repeated taps aren't identical
    const s = step + (Math.random() < 0.35 ? (Math.random() < 0.5 ? 1 : -1) : 0);
    instruments[inst](s);

    // confetti in this section's own color
    const color = parseColor(getComputedStyle(el).backgroundColor);
    if (color && color.a > 0) {
      const css = `rgb(${color.r}, ${color.g}, ${color.b})`;
      confetti(e.clientX, e.clientY, css);
    }

    el.classList.add('hit');
    setTimeout(() => el.classList.remove('hit'), 120);
  });
});


// ---------- Background decor ----------
// Soft floating shapes in the paintings' palette. Purely visual.
(function buildDecor() {
  const decor = document.getElementById('decor');
  if (!decor) return;

  const colors = ['rgb(211,25,12)', 'rgb(157,29,13)', '#800020', 'rgb(1,21,132)',
                  'rgb(245,237,6)', 'rgb(253,0,203)', '#111'];
  const kinds = ['circle', 'square', 'ring', 'triangle', 'line'];
  const rand = (a, b) => a + Math.random() * (b - a);

  for (let i = 0; i < 22; i++) {
    const s = document.createElement('div');
    const kind = kinds[i % kinds.length];
    const size = rand(18, 70);
    const color = colors[Math.floor(Math.random() * colors.length)];

    s.className = 'shape ' + kind;
    s.style.left = rand(0, 96) + '%';
    s.style.top = rand(0, 94) + '%';
    s.style.width = (kind === 'line' ? size * 1.8 : size) + 'px';
    s.style.height = size + 'px';
    s.style.setProperty('--s', size + 'px');
    s.style.background = color;
    s.style.color = color;
    s.style.setProperty('--dx', rand(-60, 60) + 'px');
    s.style.setProperty('--dy', rand(-70, 70) + 'px');
    s.style.setProperty('--rot', rand(-180, 180) + 'deg');
    s.style.setProperty('--dur', rand(14, 28) + 's');
    s.style.animationDelay = (-rand(0, 20)) + 's';
    decor.appendChild(s);
  }
})();
