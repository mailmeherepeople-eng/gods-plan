// A discovery is announced (mind:discovery { id, name, person, year, earthYear, effects }). Round 2 (2026-11-13):
// no more card in the middle of the map beside the slot; a discovery is a token that pops in at the top right with
// its marker over the finder, opens in the one slot (what was found, who found it and where, what it brings, how
// it stands against Earth), and after 30 seconds, or when put away, flies to the Log. The simulation's own alert
// goes to the Log as before.
import { h, yearLabel } from './dom.js';

const LIFE_S = 30;

export default [{
  type: 'panel', id: 'discover', region: 'root', order: 40,
  make(U) {
    const yrs = (n) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'year' : 'years'}`;
    // where the people stand today, the same words as the World door's Earth line
    const standing = () => {
      const a = U.call('sim', 'ask', 'earth')?.ahead; // fresh: it just changed
      if (!Number.isFinite(a)) return '';
      return `Today: ${a > 0 ? `ahead of Earth by ${yrs(a)}` : a < 0 ? `behind Earth by ${yrs(a)}` : 'level with Earth'}.`;
    };
    U.on('mind:discovery', (d) => {
      if (!d) return;
      const p = d.person && typeof d.person === 'object' ? d.person : null;
      const clan = p ? U.s2.clanOf(p) : null;
      const where = clan?.village?.name ? ` in ${clan.village.name}` : '';
      const who = p ? `${p.name}${clan ? ` of the ${clan.name}` : ''} found it${where}` : `Found${where}`;
      const fx = U.s2.effectWords(d.effects);
      const diff = Number.isFinite(d.earthYear) && Number.isFinite(d.year) ? d.earthYear - d.year : null;
      const lines = [
        `${who}${Number.isFinite(d.year) ? `, ${yearLabel(d.year)}` : ''}.`,
        fx.length ? `It brings ${fx.join(', ')}.` : '',
        diff != null ? `Earth had it by ${yearLabel(d.earthYear)}: ${diff > 0 ? `found ${yrs(diff)} sooner than on Earth` : diff < 0 ? `found ${yrs(diff)} later than on Earth` : 'found the very same year as on Earth'}.` : '',
        standing(),
      ].filter(Boolean);
      const x = Number.isFinite(d.x) ? d.x : p?.x, z = Number.isFinite(d.z) ? d.z : p?.z;
      U.attend?.note(`disc:${d.id ?? d.name}`, { kind: 'discovery', sev: 'good', icon: 'spark', title: `A discovery: ${d.name ?? 'something new'}`, x, z, subject: p, skip: !!d.skip, src: { what: `Your people have found ${String(d.name ?? 'something new').toLowerCase()}.`, lines } }, LIFE_S);
      if (!d.skip) U.sfx('discovery');
    });
    const el = h('span', 'discover-stub');
    el.hidden = true;
    return el;
  },
}];
