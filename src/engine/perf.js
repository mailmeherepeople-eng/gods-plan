// Frame timing, for finding lag. main.js marks the phases of every rendered
// frame (clock, mesh, god, sim, ui, overlay, render); modules add counters
// (`ctx.perf.count('paths')`). The last PERF_FRAMES frames are kept in typed
// arrays (no per-frame allocation), so a report can say when the slow frames
// came and what was going on: speed, a moment or not, the hour of the day,
// chunks remeshed, path searches, people, a heap drop (a garbage collection).
//
// Console:  game.perf.report()        the last 60 s (report(0) = everything kept)
//           game.perf.reset()         start a fresh measurement
//           game.perf.slowest(10)     the worst frames with their context
// `?perf=1` in the address shows a small live readout in the bottom left corner.
const N = 1 << 15; // about 9 minutes at 60 fps
const PHASES = ['clock', 'mesh', 'god', 'sim', 'ui', 'overlay', 'render'];
const COUNTS = ['chunks', 'paths', 'pathNodes', 'pathWait'];

export function makePerf(info = () => ({})) {
  const col = () => new Float32Array(N);
  const D = {
    t: new Float64Array(N), gap: col(), cpu: col(), hidden: new Uint8Array(N),
    speed: col(), moment: new Uint8Array(N), day: col(), people: col(), heap: col(),
  };
  for (const p of PHASES) D[p] = col();
  for (const c of COUNTS) D[c] = col();
  let n = 0, head = 0, t0 = 0, tLap = 0, lastT = 0;
  const cur = {};
  for (const c of COUNTS) cur[c] = 0;
  const mem = () => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0);

  // every display refresh, rendered or not: the refresh rate and missed vsyncs
  const raf = { n: 0, sum: 0, last: 0, long: 0 };
  const rafLoop = (t) => {
    if (raf.last && !document.hidden) { const d = t - raf.last; if (d < 250) { raf.n++; raf.sum += d; if (d > 25) raf.long++; } }
    raf.last = t;
    requestAnimationFrame(rafLoop);
  };
  requestAnimationFrame(rafLoop);

  const P = {
    phases: PHASES,
    begin() { t0 = tLap = performance.now(); },
    lap(name) {
      const now = performance.now();
      const v = now - tLap; tLap = now;
      if (D[name]) D[name][head] = v;
    },
    count(name, k = 1) { if (name in cur) cur[name] += k; },
    end(hidden = false) {
      const now = performance.now();
      const i = head;
      D.t[i] = t0; D.cpu[i] = now - t0; D.gap[i] = lastT ? t0 - lastT : 0; lastT = t0;
      D.hidden[i] = hidden ? 1 : 0;
      const s = info();
      D.speed[i] = s.speed ?? 0; D.moment[i] = s.moment ? 1 : 0; D.day[i] = s.day ?? -1; D.people[i] = s.people ?? 0;
      D.heap[i] = mem();
      for (const c of COUNTS) { D[c][i] = cur[c]; cur[c] = 0; }
      head = (head + 1) % N; if (n < N) n++;
      // clear the next slot's phases (a phase that did not run this frame reads 0)
      for (const p of PHASES) D[p][head] = 0;
    },
    reset() { n = 0; head = 0; lastT = 0; raf.n = 0; raf.sum = 0; raf.long = 0; },
    // indices of the frames kept, oldest first, within the last `sec` seconds (0 = all)
    frames(sec = 60) {
      const out = [];
      const now = performance.now();
      for (let k = n; k >= 1; k--) {
        const i = (head - k + N) % N;
        if (D.hidden[i] || !D.gap[i]) continue;
        if (sec && now - D.t[i] > sec * 1000) continue;
        out.push(i);
      }
      return out;
    },
    slowest(k = 10, sec = 60) {
      const idx = P.frames(sec).sort((a, b) => D.gap[b] - D.gap[a]).slice(0, k);
      return idx.map((i) => P.row(i));
    },
    row(i) {
      const r = { at: Math.round((D.t[i] - performance.now()) / 100) / 10 + ' s', gap: rd(D.gap[i]), cpu: rd(D.cpu[i]) };
      for (const p of PHASES) r[p] = rd(D[p][i]);
      for (const c of COUNTS) r[c] = D[c][i];
      r.speed = D.speed[i]; r.moment = !!D.moment[i]; r.day = rd(D.day[i], 100); r.people = D.people[i];
      const prev = (i - 1 + N) % N;
      r.gcMB = D.heap[prev] - D.heap[i] > 0.5 ? rd(D.heap[prev] - D.heap[i]) : 0;
      return r;
    },
    measure(sec = 60) {
      const idx = P.frames(sec);
      const of = (arr) => summary(idx.map((i) => arr[i]));
      const out = { frames: idx.length, seconds: idx.length ? rd((D.t[idx[idx.length - 1]] - D.t[idx[0]]) / 1000) : 0 };
      out.gap = of(D.gap); out.cpu = of(D.cpu);
      out.fps = out.gap.avg ? rd(1000 / out.gap.avg) : 0;
      out.over20ms = idx.filter((i) => D.gap[i] > 20).length;
      out.over34ms = idx.filter((i) => D.gap[i] > 34).length;
      out.phases = {};
      for (const p of PHASES) out.phases[p] = of(D[p]);
      out.counts = {};
      for (const c of COUNTS) { const s = of(D[c]); out.counts[c] = { perFrame: s.avg, max: s.max }; }
      let gcs = 0;
      for (let k = 1; k < idx.length; k++) if (D.heap[idx[k - 1]] - D.heap[idx[k]] > 0.5) gcs++;
      out.heapDrops = gcs;
      out.display = { hz: raf.n ? rd(1000 / (raf.sum / raf.n)) : 0, missedVsyncs: raf.long };
      return out;
    },
    report(sec = 60) {
      const s = P.measure(sec);
      console.log(`perf: ${s.frames} frames over ${s.seconds} s, ${s.fps} fps; frame gap avg ${s.gap.avg} p95 ${s.gap.p95} p99 ${s.gap.p99} max ${s.gap.max} ms; cpu avg ${s.cpu.avg} p99 ${s.cpu.p99} max ${s.cpu.max} ms; ${s.over20ms} frames over 20 ms; display ${s.display.hz} Hz`);
      const tbl = {};
      for (const p of PHASES) tbl[p] = s.phases[p];
      console.table(tbl);
      console.table(P.slowest(8, sec));
      return s;
    },
    data: D,
  };
  if (new URLSearchParams(location.search).get('perf') === '1') readout(P);
  return P;
}

const rd = (v, k = 10) => Math.round(v * k) / k;
function summary(v) {
  if (!v.length) return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const s = Float64Array.from(v).sort();
  const q = (f) => rd(s[Math.min(s.length - 1, Math.floor(f * s.length))], 100);
  let sum = 0; for (const x of s) sum += x;
  return { avg: rd(sum / s.length, 100), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: rd(s[s.length - 1], 100) };
}

// a small live readout (?perf=1): fps, frame gap p99 and worst, cpu by phase, over the last 5 s
function readout(P) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;pointer-events:none;font:11px/1.35 ui-monospace,monospace;color:#e8f0f0;background:rgba(10,20,24,.72);padding:6px 8px;border-radius:6px;white-space:pre';
  document.body.appendChild(el);
  setInterval(() => {
    const s = P.measure(5);
    const ph = P.phases.map((p) => `${p} ${s.phases[p].avg.toFixed(2)}/${s.phases[p].max.toFixed(1)}`).join('\n');
    el.textContent = `${s.fps} fps  gap p99 ${s.gap.p99} max ${s.gap.max}\ncpu ${s.cpu.avg} avg ${s.cpu.max} max (ms)\n${ph}\nremesh ${s.counts.chunks.perFrame}/f  paths ${s.counts.paths.perFrame}/f  waits ${s.counts.pathWait.perFrame}/f`;
  }, 500);
}
