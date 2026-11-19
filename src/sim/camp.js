// Sleeping out (2026-11-13; the director: "people sleeping outside need to have a different animation. right now
// they are just lying on their side."). Who sleeps outdoors: a settled family whose hut is not built yet (or
// burned, or washed out), anyone the night catches far from home, and now families still wandering in search of
// land, who make camp for the deep of the night instead of walking on in the dark. The look is bodies.js
// sleepPose (on the back on a hide mat, a blanket to the chest, slow breathing); this file makes the wanderers'
// camp, lights a small camp fire wherever two or more of a family sleep out together, keeps wolves off sleepers
// by a fire, and puts a body that dies in its sleep back into the dead's own pose. Numbers: TUNE_CAMP.
import { makeCampfire, sleepPose } from './bodies.js';

export const TUNE_CAMP = {
  CAMP_FROM: 0.64,     // wandering families stop and make camp from this part of the day (dusk ends 0.7) to waking
  RING: 2.2,           // their mats lie this far out round the camp fire, feet to it
  FIRE_FROM: 2,        // a family needs this many asleep outdoors together for a fire (a wanderers' camp always has one)
  FIRE_GROUP: 6,       // sleepers of one family within this of each other share a fire
  WARD: 7,             // a wolf hunting someone asleep within this of a lit camp fire gives it up
  REFRESH_S: 0.5,      // game seconds between fire checks
};
const K = TUNE_CAMP;

export default {
  id: 'camp',
  tune: TUNE_CAMP,
  init(R) {
    const { S, ctx, T } = R;
    const P = () => S.peopleApi;
    const fires = new Map(); // key (family id or camp) -> { fx, x, z, y }
    let refreshT = 0;
    const camping = (f) => f.state === 'wander' && P().isNight() && (S.dayT >= K.CAMP_FROM || S.dayT < T.WAKE);

    // ---------- a family's camp for the night: a fire, and their mats round it like the spokes of a wheel ----------
    function lieDown(m, camp, doing) {
      m.asleep = true;
      m.yawT = Math.atan2(camp.x - m.x, camp.z - m.z); // facing the fire: the feet are toward it, the head away
      P().work(m, 'sit', 999, { doing });
    }
    // where a family camps: wanderers where the night finds them; a family with no finished home just outside
    // the door of the hut they are building (away from the walls), else beside the leader
    function campOf(f) {
      if (f.ext?.camp) return f.ext.camp;
      const live = f.members.filter((m) => !m.dead);
      const L = f.leader() ?? live[0];
      if (!L) return null;
      let at = null;
      const h = f.home, d = h?.door;
      const tree = R.ask('shelterFor', L); // shelter.js: under trees, by water if they can (never the open)
      if (tree) at = P().spotNear(tree.x, tree.z, 0, 1.5);
      else if (f.state === 'settled' && h && d && d.x != null) {
        const cx = h.cx ?? d.x, cz = h.cz ?? d.z, dx = d.x - cx, dz = d.z - cz, n = Math.hypot(dx, dz) || 1;
        const x = d.x + dx / n * 3.2, z = d.z + dz / n * 3.2;
        if (S.land.passable(Math.floor(x), Math.floor(z), 'deer')) at = { x, z };
        else at = P().spotNear(d.x, d.z, 2, 4);
      } else at = P().spotNear(L.x, L.z, 0, 1.5);
      R.data(f, 'camp', null);
      f.ext.camp = { x: at.x, z: at.z };
      return f.ext.camp;
    }
    function slotOf(f, m, c) {
      const live = f.members.filter((q) => !q.dead);
      const i = Math.max(0, live.indexOf(m)), n = Math.max(3, live.length);
      const a = i / n * Math.PI * 2 + 0.5;
      return { x: c.x + Math.cos(a) * K.RING, z: c.z + Math.sin(a) * K.RING };
    }
    // walk to the slot and lie down (returns true: the person's next act is taken)
    function bedDown(m, doing) {
      const f = m.family, c = campOf(f);
      if (!c) return false;
      const s = slotOf(f, m, c);
      if (Math.hypot(s.x - m.x, s.z - m.z) < 0.6) { m.go = null; lieDown(m, c, doing); return true; }
      P().goTo(m, s.x, s.z, { direct: Math.hypot(s.x - m.x, s.z - m.z) < 12, r: 0.45, until: 12, doing: 'making camp for the night', then: () => lieDown(m, c, doing) });
      m.go.camp = true;
      return true;
    }
    function campStep(f) {
      if (!camping(f)) return;
      for (const m of f.members) {
        if (m.dead || m.asleep || m.fleeing || m.go?.camp) continue;
        bedDown(m, 'asleep by the camp fire');
      }
    }
    // the camps break at dawn (or when wanderers chose a place to settle in the night: up, and off the mats)
    function breakCamps() {
      for (const f of S.families) {
        if (!f.ext?.camp) continue;
        const night = P().isNight();
        if (f.state === 'wander' ? camping(f) : night && f.state === 'settled') continue;
        f.ext.camp = null;
        if (f.state !== 'wander' && f.state !== 'settled') for (const m of f.members) if (m.asleep && !m.hidden && m.work?.dur === 999) { m.asleep = false; m.work = null; }
      }
    }
    // a settled family without a finished home sleeps out round its own fire (instead of anywhere by the door)
    R.on('activity', (p) => {
      const f = p.family;
      if (!P().isNight() || f.state !== 'settled' || f.home?.done || p.hidden || p.fleeing) return false;
      p.nightBound = true;
      return bedDown(p, 'asleep under the sky');
    });

    // ---------- camp fires ----------
    function groups() {
      const out = new Map();
      for (const f of S.families) {
        const sleepers = f.members.filter((m) => m.asleep && !m.hidden && !m.dead);
        if (!sleepers.length) continue;
        const camp = f.ext?.camp;
        if (camp && (f.state === 'wander' || sleepers.length >= K.FIRE_FROM)) { out.set(f.id, { x: camp.x, z: camp.z }); continue; }
        if (sleepers.length < K.FIRE_FROM) continue;
        // the biggest cluster: the sleepers near the first one
        const a = sleepers[0], near = sleepers.filter((m) => Math.hypot(m.x - a.x, m.z - a.z) < K.FIRE_GROUP);
        if (near.length < K.FIRE_FROM) continue;
        let x = 0, z = 0;
        for (const m of near) { x += m.x; z += m.z; }
        x /= near.length; z /= near.length;
        // not on top of anyone: step away from the nearest sleeper
        let nd = Infinity, nm = null;
        for (const m of near) { const d = Math.hypot(m.x - x, m.z - z); if (d < nd) { nd = d; nm = m; } }
        if (nm && nd < 1.4) { const dx = x - nm.x, dz = z - nm.z, d = Math.hypot(dx, dz) || 1; x = nm.x + dx / d * 1.5; z = nm.z + dz / d * 1.5; }
        out.set(f.id, { x, z });
      }
      return out;
    }
    function refreshFires() {
      const want = groups();
      for (const [k, fire] of fires) {
        const w = want.get(k);
        if (!w || Math.hypot(w.x - fire.x, w.z - fire.z) > 2.5) { fire.fx.group.removeFromParent(); fires.delete(k); }
      }
      for (const [k, w] of want) {
        if (fires.has(k)) continue;
        const fx = makeCampfire();
        const y = S.land.topAt(Math.floor(w.x), Math.floor(w.z)) + 1;
        fx.group.position.set(w.x, y, w.z);
        ctx.layers.entities.add(fx.group);
        fires.set(k, { fx, x: w.x, z: w.z, y });
      }
    }

    R.on('step', ({ dt }) => {
      for (const f of S.families) if (f.state === 'wander') campStep(f);
      refreshT -= dt;
      if (refreshT <= 0) { refreshT = K.REFRESH_S; breakCamps(); refreshFires(); }
      if (!fires.size) return;
      // the flames flicker
      const t = S.clockT;
      for (const { fx } of fires.values()) {
        fx.a.scale.set(1, 0.75 + Math.sin(t * 9) * 0.18 + Math.sin(t * 23) * 0.08, 1);
        fx.b.scale.set(1, 0.7 + Math.sin(t * 13 + 1) * 0.25, 1);
      }
      // a wolf will not come into the firelight for a sleeper
      for (const w of S.predators) {
        const q = w.prey;
        if (w.dead || !q || q.kind !== 'person' || !q.asleep || (w.state !== 'stalk' && w.state !== 'sprint')) continue;
        let lit = false;
        for (const fire of fires.values()) if (Math.hypot(fire.x - q.x, fire.z - q.z) < K.WARD) { lit = true; break; }
        if (!lit) continue;
        if (w.outcome && w.outcome !== 'escape') R.story(q, 'A wolf came close in the night. The camp fire kept it off.');
        w.outcome = null; w.state = 'prowl'; w.prey = null; w.path = null;
        w.unreach?.set(q.id, S.clockT + 40);
      }
    });

    // dying asleep outdoors: off the mat, into the dead's own pose
    R.on('person:death', (p) => { if (p.F?.sleeping) { sleepPose(p.F, false); p.F.fig.rotation.x = 0; } });
    R.on('stats', (st) => { st.campFires = fires.size; });
    R.answer('campFires', () => [...fires.values()].map((f) => ({ x: f.x, z: f.z })));
  },
};
