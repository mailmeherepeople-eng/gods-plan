// Phones and tablets: go full screen, held sideways, on the first tap, and again on any later tap if the
// browser has dropped out of it. A browser only allows full screen as the answer to a tap, never by itself,
// so "forced" means: the very first touch does it. iPhones have no full screen for web pages at all; there
// the way is Share, then "Add to Home Screen", which opens the game with no browser bars (see the manifest).
(() => {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const d = document.documentElement;
  const req = d.requestFullscreen || d.webkitRequestFullscreen;
  if (!req) return;
  const full = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const lock = () => { try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* not here */ } };
  const go = () => {
    if (full()) return;
    try {
      const p = req.call(d, { navigationUI: 'hide' });
      if (p?.then) p.then(lock).catch(() => {}); else lock();
    } catch { /* refused: the next tap tries again */ }
  };
  // Only on a plain tap (a click). Asking on every touch end made the browser cancel the touches that followed,
  // so the first strokes of a spell were lost (found by the casting tests).
  addEventListener('click', go, true);
})();
