// A tiny event bus, so tools, the simulation and the UI talk without
// importing each other. Every event in use is listed in docs/ARCHITECTURE.md.
// A listener that throws is logged and does not stop the others.
export function makeBus() {
  const map = new Map();
  const bus = {
    // returns a function that removes the listener
    on(name, fn) {
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(fn);
      return () => bus.off(name, fn);
    },
    once(name, fn) {
      const off = bus.on(name, (p) => { off(); fn(p); });
      return off;
    },
    off(name, fn) { map.get(name)?.delete(fn); },
    emit(name, payload) {
      const set = map.get(name);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(payload); } catch (err) { console.error(`event "${name}":`, err); }
      }
    },
  };
  return bus;
}
