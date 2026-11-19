// C. Clans: people wear their clan's colour.
//
// The stage 1 body (bodies.js) takes one dye per figure, read from the
// household (`family.dye`) whenever people.js builds a figure (arrival, birth,
// coming of age, a new household). So a clan colours its people by setting the
// dye of every household it holds: from then on every figure people.js builds
// is in the clan's colour. Figures already standing are rebuilt once through
// people.js's own `refigure` (integration: this file used to copy figureFor).
// The clothes are the always-on sign of a clan; the HUD's rings (ui/clanmap.js)
// add the clan's mark shape on demand (the Clans overlay, a clan power, a fight).

export function makeLook(R) {
  const refigure = (p) => R.S.peopleApi.refigure(p);
  // a household takes its clan's colour; its standing people are rebuilt if the colour changed
  function dyeHousehold(f, dye) {
    if (!f) return 0;
    if (f.dye === dye) return 0;
    f.dye = dye;
    let n = 0;
    for (const m of f.members) if (!m.dead && refigure(m)) n++;
    return n;
  }
  return { refigure, dyeHousehold };
}
