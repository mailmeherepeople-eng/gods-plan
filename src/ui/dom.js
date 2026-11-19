// Small DOM helpers and the HUD's icons. An icon is the director's chosen sign where he chose one (signs.js, from the
// sign picker; ICON_SIGN below says which sign each icon name takes); the rest keep their own drawing here: a 24 px
// grid, a 2 px ink stroke, one flat fill (class "f"). No icon pack, no real religion's symbols; the standing stone is
// the only sacred shape.
import { signSvg, hasSign, oldAsSign, sealSvg } from './signs.js';

export function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// -5000 -> "5000 BC", -1 -> "1 BC", 0 -> "AD 1" (the calendar has no year 0)
export function yearLabel(y) {
  if (!Number.isFinite(y)) return '-';
  const f = Math.floor(y);
  return f < 0 ? `${-f} BC` : `AD ${f + 1}`;
}
export const num = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '-');

// Writes that only touch the DOM when the value really changes. The HUD refreshes many times a second;
// writing the same text, attribute or `hidden` again still counts as a change to the browser (a text node is
// thrown away and made anew, an attribute is set again), which restarts hover and focus states, tooltips and
// transitions: the "flashing" the director saw (2026-11-13). Use these in every refresh loop.
export function setText(el, t) {
  if (!el) return el;
  t = String(t ?? '');
  const n = el.firstChild;
  // one text node is kept, even when empty, so new words are a change of its value, never a node made anew
  if (n && n.nodeType === 3 && !n.nextSibling) { if (n.nodeValue !== t) n.nodeValue = t; }
  else if (!n) el.appendChild(document.createTextNode(t));
  else if (el.textContent !== t) el.textContent = t;
  return el;
}
export function setAttr(el, name, v) {
  if (!el) return el;
  if (v == null || v === false) { if (el.hasAttribute(name)) el.removeAttribute(name); }
  else { v = v === true ? '' : String(v); if (el.getAttribute(name) !== v) el.setAttribute(name, v); }
  return el;
}
export function setHidden(el, on) { if (el && el.hidden !== !!on) el.hidden = !!on; return el; }
export function setDisabled(el, on) { if (el && el.disabled !== !!on) el.disabled = !!on; return el; }
export function setData(el, k, v) { if (!el) return el; if (v == null || v === '') { if (k in el.dataset) delete el.dataset[k]; } else if (el.dataset[k] !== String(v)) el.dataset[k] = String(v); return el; }
export function setStyle(el, prop, v) { if (el && el.style.getPropertyValue(prop) !== v) el.style.setProperty(prop, v); return el; }
export function setHtml(el, html) { if (el && el._html !== html) { el._html = html; el.innerHTML = html; } return el; }

// set a tooltip on an element: name, key, one sentence, optional narrator line (only what changed is written)
export function tip(el, name, desc = '', key = '', aside = '') {
  const tv = String(name ?? '');
  if (el.dataset.tip !== tv) el.dataset.tip = tv;
  setData(el, 'desc', desc || null);
  setData(el, 'key', key || null);
  setData(el, 'aside', aside || null);
  if (!el.getAttribute('aria-label') && name) el.setAttribute('aria-label', key ? `${name} (${key})` : name);
  return el;
}

const P = {
  land: '<path d="M2 20h20"/><path class="f" d="M3 20c3-6 5-8.5 9-8.5s6 2.5 9 8.5"/><path d="M12 8.5V2.5M9.5 5 12 2.5 14.5 5"/>',
  paint: '<path d="M20.5 3 12.8 10.7"/><path class="f" d="M12.8 10.7c-2-1.3-5.2-.5-6.2 2.4-.7 2-1.6 3.6-3.6 4.6 3.6 2.3 8.6 1.3 10.4-1.8 1-1.9 1-3.8-.6-5.2z"/>',
  water: '<path d="M3 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  scatter: '<path d="M12 21v-5.5"/><path class="f" d="M12 3c-3.5 0-6 2.6-6 6 0 3 2.7 5.2 6 5.2S18 12 18 9c0-3.4-2.5-6-6-6z"/><path d="M3.5 20.5h.01M20.5 20.5h.01M4.5 15.5h.01"/>',
  erase: '<path d="M12 21v-7"/><path class="f" d="M12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5z"/><path class="f" d="M12 12c0-3 2.5-5 6-5 0 3-2.5 5-6 5z"/><path d="M3.5 3.5 20.5 20.5"/>',
  strike: '<path d="M13.5 1.5 9 8h4l-3 5"/><path class="f" d="M4 21v-2.5C4 17.1 5 16 6.5 16h8c1.2 0 2-.6 2.6-1.6L18 13l2.5 1.2-1 2c-.4.8-1 1.4-1.5 1.8V21"/><path d="M7.5 21v-2M14 21v-2"/>',
  area: '<rect x="4" y="4" width="16" height="16" rx="1.5" stroke-dasharray="3 3"/><path class="f" d="M8 8h8v8H8z"/>',
  path: '<path d="M4 21c1.5-5 6-4.5 7.5-9S17 6 20 3" stroke-dasharray="2.5 3"/><path d="M4 21h.01M20 3h.01"/>',
  pick: '<path d="m14.5 3.5 6 6"/><path class="f" d="M17.5 6.5 8 16l-4.5 1 1-4.5L14 3z"/>',
  measure: '<path class="f" d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  dot: '<circle class="f" cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/>',
  undo: '<path d="M9 4 4 9l5 5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H10"/>',
  redo: '<path d="m15 4 5 5-5 5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H14"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14"/>',
  play: '<path class="f" d="M7.5 4.5v15l12-7.5z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  log: '<rect class="f" x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  close: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>',
  sun: '<circle class="f" cx="12" cy="12" r="4.5"/><path d="M12 2.8h.01M12 21.2h.01M2.8 12h.01M21.2 12h.01M5.5 5.5h.01M18.5 18.5h.01M5.5 18.5h.01M18.5 5.5h.01" stroke-width="2.8"/>',
  dusk: '<path d="M2 17.5h20"/><path class="f" d="M6.5 17.5a5.5 5.5 0 0 1 11 0"/><path d="M12 7.5h.01M5.2 10.2h.01M18.8 10.2h.01" stroke-width="2.8"/>',
  night: '<path class="f" d="M12 4a8 8 0 1 0 8 8h-5a3 3 0 0 1-3-3z"/>',
  seen: '<circle class="f" cx="6" cy="8.5" r="3"/><path d="M2.5 20c0-3.6 1.6-6 3.5-6s3.5 2.4 3.5 6"/><path d="M11.5 8.5h9" stroke-dasharray="2 2.4"/>',
  unseen: '<circle class="f" cx="6" cy="8.5" r="3"/><path d="M2.5 20c0-3.6 1.6-6 3.5-6s3.5 2.4 3.5 6"/><path d="M11.5 8.5h9" stroke-dasharray="2 2.4"/><path d="M13.5 3.5 19 14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  'sev-info': '<circle class="f" cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  'sev-good': '<circle class="f" cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  'sev-warn': '<path class="f" d="M12 3 22 20H2z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  'sev-bad': '<path class="f" d="M12 2 22 12 12 22 2 12z"/><path d="M12 7.5V13M12 16.5h.01"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  flat: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  hourglass: '<path class="f" d="M7 3h10v2c0 3-5 5-5 7 0-2-5-4-5-7zM7 21h10v-2c0-3-5-5-5-7 0 2-5 4-5 7z"/>',
  follow: '<circle cx="12" cy="12" r="7"/><circle class="f" cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  happy: '<circle class="f" cx="12" cy="12" r="9"/><path d="M8 14c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2M9 9.5h.01M15 9.5h.01"/>',
  faith: '<path class="f" d="M8 21V8.5C8 5.2 9.8 3 12 3s4 2.2 4 5.5V21"/><path d="M4 21h16"/>',
  doubt: '<path d="M8.8 8.8a3.3 3.3 0 1 1 4.9 2.9c-1.1.6-1.7 1.4-1.7 2.6"/><path d="M12 18.2h.01M4 5h.01M20 5h.01M4 19h.01M20 19h.01"/>',
  paw: '<circle class="f" cx="12" cy="15.5" r="3.6"/><circle cx="6.3" cy="10" r="1.8"/><circle cx="9.9" cy="6.3" r="1.8"/><circle cx="14.1" cy="6.3" r="1.8"/><circle cx="17.7" cy="10" r="1.8"/>',
  people: '<circle class="f" cx="9" cy="8" r="3"/><path d="M3.5 20c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6"/><circle cx="17" cy="9" r="2.3"/><path d="M15.8 14.2c2.8.3 4.7 2.6 4.7 5.8"/>',
  hut: '<path class="f" d="M3 20 12 5l9 15z"/><path d="M10 20v-5h4v5"/>',
  field: '<path d="M3 20h18"/><path d="M6 20c.6-4 1-7 1-11M10.5 20c.3-4 .5-7 .5-11M14.5 20c-.3-4-.5-7-.5-11M19 20c-.6-4-1-7-1-11"/>',
  family: '<circle class="f" cx="7" cy="7.5" r="2.5"/><circle class="f" cx="17" cy="7.5" r="2.5"/><circle cx="12" cy="12.5" r="1.8"/><path d="M3 20c0-3.5 1.8-6.5 4-6.5M21 20c0-3.5-1.8-6.5-4-6.5M9.5 20c0-2 1-3.5 2.5-3.5s2.5 1.5 2.5 3.5"/>',
  open: '<circle cx="12" cy="12" r="7.5"/>',
  met: '<circle class="f full" cx="12" cy="12" r="8.5"/><path d="M8 12.5l3 3 5-6"/>',
  go: '<path d="M5 12h12M12.5 7l5 5-5 5"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  keys: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8"/>',
  sprout: '<path d="M12 21v-8"/><path class="f" d="M12 13c0-4-3-6-7-6 0 4 3 6 7 6z"/><path class="f" d="M12 11c0-3 2.5-5 6-5 0 3-2.5 5-6 5z"/>',
  stone: '<path class="f" d="M9 20V9c0-3 1.3-5 3-5s3 2 3 5v11"/><path d="M5 20h14"/><path d="M11 9h.01M13 12h.01M11 15h.01"/>',
  grave: '<path class="f" d="M3 20c1.5-4 5-6 9-6s7.5 2 9 6z"/><path d="M12 3v8M9 6h6"/>',
  peace: '<path class="f" d="M4 13c3-1 6-4 8-8 1 3 0 6-2 8 3 0 6 1 9 4-4 1-8 1-11-1-1 2-3 3-5 3 1-2 1-4 1-6z"/><path d="M15 9h.01"/>',
  // ---- stage 2: one per power, and the readouts' own (drawn for this game; no faith's symbols) ----
  // heal: a leaf rising out of a cupped hand
  heal: '<path class="f" d="M12.5 3c-3 1.8-4.2 4.3-3.3 6.8 2.6.5 4.5-1.1 4.9-3.6.2-1.3-.4-2.4-1.6-3.2z"/><path d="M11 10.2 10 12.5"/><path d="M2.5 13.5c1.8 0 3 .5 4 1.5l1.6 1.4h5a1.7 1.7 0 0 1 0 3.4H8.6"/><path d="m13.6 17.4 4.2-2.3c1.1-.6 2.4-.2 2.9.9L14.8 21H6.5l-4-2.2"/>',
  // bless the harvest: a tied sheaf
  harvest: '<path d="M12 21V9.5M12 14l-3.8-5M12 14l3.8-5"/><path class="f" d="M12 9.5c-1.4-1.4-1.4-4.1 0-5.5 1.4 1.4 1.4 4.1 0 5.5zM8.2 9c-1.9-.4-3.1-2.4-2.7-4.3 1.9.4 3.1 2.4 2.7 4.3zM15.8 9c1.9-.4 3.1-2.4 2.7-4.3-1.9.4-3.1 2.4-2.7 4.3z"/><path d="M9 17h6"/>',
  // sickness: a slumped figure with fever lines beside the head
  sick: '<circle class="f" cx="8.5" cy="7.5" r="3"/><path d="M3.5 21c0-4 2-7.5 5-7.5 2.4 0 3.8 1.7 4.4 4"/><path d="M15.5 3.5c1.5 1 1.5 2.5 0 3.5s-1.5 2.5 0 3.5M19.5 5.5c1.5 1 1.5 2.5 0 3.5s-1.5 2.5 0 3.5"/>',
  fire: '<path class="f" d="M12 2.5c.6 3.2 4.8 5.2 4.8 10.2a4.8 4.8 0 0 1-9.6 0c0-2.6 1.2-3.9 2.1-5.2.4 1.7 1 2.5 2.1 2.9-.4-2.6-.3-5.2.6-7.9z"/><path d="M5 21.5h14"/>',
  // flood: water over a hut's eaves
  flood: '<path class="f" d="M6 11.5 12 5.5l6 6"/><path d="M8 11v3.5M16 11v3.5"/><path d="M2 16.2c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0 2 .1 2 .1"/><path d="M2 20.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0 2 .1 2 .1"/>',
  // whisper an idea: a spark set inside a head
  whisper: '<path class="f" d="M9 21v-3.3C6.6 16.2 5 14 5 11a7 7 0 0 1 14 0l1.5 3.2H19v2.4a1.5 1.5 0 0 1-1.5 1.5H15V21"/><path d="m11.8 7.5 1.8 2-1.8 2-1.8-2z"/>',
  // give a thought: a thought cloud
  thought: '<path class="f" d="M7.3 14.5a4.3 4.3 0 0 1 .5-8.6 5 5 0 0 1 8.6-.1 4.3 4.3 0 0 1 .3 8.7z"/><circle cx="7" cy="18.3" r="1.5"/><circle cx="4.3" cy="21.2" r=".9"/>',
  // bless weapons: a stone-headed club with a glint
  club: '<path d="M4 21 14.5 10.5"/><path class="f" d="m12.5 7 4.5-4.5 4.5 4.5-4.5 4.5z"/><path d="M5 10h.01M8.5 6h.01M3 14.5h.01" stroke-width="2.6"/>',
  // calm: an open hand pressing down over level lines
  calm: '<path class="f" d="M5.5 10.5V7a1.5 1.5 0 0 1 3 0v2V5a1.5 1.5 0 0 1 3 0v4V5.5a1.5 1.5 0 0 1 3 0v4V7.5a1.5 1.5 0 0 1 3 0V12c0 2-1.5 3.5-3.5 3.5h-5c-2.2 0-3.5-2-3.5-5z"/><path d="M3.5 19h17M7 22h10"/>',
  // provoke: two heads and a jag between them
  provoke: '<circle class="f" cx="4.8" cy="8" r="2.5"/><circle class="f" cx="19.2" cy="8" r="2.5"/><path d="M1.8 20.5c0-3.3 1.3-6 3-6s3 2.7 3 6M16.2 20.5c0-3.3 1.3-6 3-6s3 2.7 3 6"/><path d="m11 4.5 2.2 2.6-2.4 2.4 2.4 2.6-2.2 2.4"/>',
  // favour: a cup-and-ring mark, the god's private sign
  favour: '<circle class="f" cx="12" cy="11" r="2.6"/><path d="M12 13.6V22"/><path d="M8.2 17.6a6.5 6.5 0 1 1 7.6 0"/>',
  // commandments: a clay tablet with tally notches
  tablet: '<rect class="f" x="4.5" y="2.5" width="15" height="19" rx="2"/><path d="M8.5 6.5v4M11.5 6.5v4M14.5 6.5v4M8.5 15h7M8.5 18h4"/>',
  // a discovery: a struck flint and its sparks
  spark: '<path class="f" d="m3.5 20.5 4-6.5 5 3.5-3.5 4.5z"/><path d="m13.5 10.5 1.8-5.5M16.8 12.5l4.2-3M17.5 16.5H22M11.6 8 10.6 3.5"/>',
  earth: '<circle class="f" cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18"/>',
  balance: '<path d="M12 4.5V20M7.5 20.5h9M3.5 7h17"/><path class="f" d="M4.5 7 2 13h5zM19.5 7 17 13h5z"/><circle cx="12" cy="3.5" r="1"/>',
  wound: '<rect class="f" x="3" y="8.5" width="18" height="7" rx="2" transform="rotate(-20 12 12)"/><path d="m9.3 9.8 1.6 4.6M13.4 8.4l1.6 4.6"/>',
  hunger: '<path class="f" d="M3 10h18a9 9 0 0 1-18 0z"/><path d="m12.5 10-1.6 3 2 2-1 3"/>',
  drought: '<circle class="f" cx="12" cy="7" r="3.5"/><path d="M2 14.5h20M6.5 14.5l1.8 3-1 3.5M14 14.5l-1 3 2 3.5M18.5 14.5l1.5 2.5"/>',
  fight: '<path class="f" d="M2 12 9.5 5.5v13z"/><path class="f" d="M22 12 14.5 5.5v13z"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.2"/>',
  less: '<path d="M6 15l6-6 6 6"/>',
  expand: '<path d="M6 9l6 6 6-6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5.5 5.5"/>',
  quill: '<path class="f" d="M20 3.5c-7 .5-11.5 5-13 12l2 1c3-.5 7.5-4 11-13z"/><path d="M3.5 21 9 15.5"/>',
  clan: '<circle class="f" cx="12" cy="6" r="2.6"/><circle class="f" cx="5.5" cy="9.5" r="2.2"/><circle class="f" cx="18.5" cy="9.5" r="2.2"/><path d="M8 21c0-4 1.8-7.5 4-7.5s4 3.5 4 7.5M2 20c0-3 1.5-5.5 3.5-5.5M22 20c0-3-1.5-5.5-3.5-5.5"/>',
  village: '<path class="f" d="M2 20 7 11l5 9zM12 20l5-9 5 9z"/><path d="M1.5 20.5h21"/>',
  sight: '<path d="M2.5 12h19"/><path d="m17 7.5 4.5 4.5-4.5 4.5"/>',
  // ---- the new screen (2026-11-13): doors, tokens, the three forces ----
  // a cave: a hill with a dark mouth
  cave: '<path class="f" d="M2 20c2.5-8 5.5-13 10-13s7.5 5 10 13z"/><path d="M9 20v-3.5a3 3 0 0 1 6 0V20"/>',
  // a prayer: two hands raised, open
  pray: '<path class="f" d="M8.5 21v-5L5 11.5V5.5a1.4 1.4 0 0 1 2.8 0V10M15.5 21v-5l3.5-4.5V5.5a1.4 1.4 0 0 0-2.8 0V10"/><path d="M9.5 6.5 12 3l2.5 3.5"/>',
  // a great person: a band of three raised stones over a head
  great: '<circle class="f" cx="12" cy="15" r="4"/><path d="M5 8.5 7 4l2.5 3L12 2.5 14.5 7 17 4l2 4.5z"/><path d="M5.5 21.5c1-2 3.6-3 6.5-3s5.5 1 6.5 3"/>',
  // the powers door: an open hand with light coming from it
  hand: '<path class="f" d="M6.5 13V8.2a1.4 1.4 0 0 1 2.8 0V12V5.6a1.4 1.4 0 0 1 2.8 0V12V6.4a1.4 1.4 0 0 1 2.8 0V12v-3a1.4 1.4 0 0 1 2.8 0v5.5c0 4-2.8 7-6.4 7-2.6 0-4.3-1.3-5.6-3.4L4 14.6a1.4 1.4 0 0 1 2.2-1.6z"/><path d="M3 4.5 5 6M12 1.5V3M21 4.5 19 6"/>',
  // strength: a raised fist
  strength: '<path class="f" d="M7 21v-4.5L5.5 13V8.5a1.5 1.5 0 0 1 3 0V7a1.5 1.5 0 0 1 3 0v-.5a1.5 1.5 0 0 1 3 0V7a1.5 1.5 0 0 1 3 0v6l-2 3.5V21z"/><path d="M8.5 10.5h9"/>',
  // the three forces: a three-cornered shape inside its frame
  forces: '<path d="M12 2.5 21.5 19h-19z"/><path class="f" d="M12 7.5 17.5 17h-9z"/>',
  // a blessed line: a family tree
  line: '<circle class="f" cx="12" cy="4.5" r="2.2"/><circle class="f" cx="6" cy="19" r="2.2"/><circle class="f" cx="18" cy="19" r="2.2"/><path d="M12 6.7v5.3M6 16.8V12h12v4.8"/>',
  // a turning point: a path that forks
  turn: '<path d="M12 21v-7l-6-6M12 14l6-6"/><path d="M3 5.5 6 8l.5-4M21 5.5 18 8l-.5-4"/>',
  // full screen, and back
  full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  unfull: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
  // the Log: a parchment scroll, rolled at the top and the foot, lines of writing between
  scroll: '<path class="f" d="M6.5 7h11v10h-11z"/><path d="M7 3h11a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4zM6 17h11a2 2 0 0 1 0 4H6a2 2 0 0 1 0-4zM6.5 7v10M17.5 7v10"/><path d="M9.5 10h5M9.5 13h5"/>',
  tick: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  book: '<path class="f" d="M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1V19c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6.5V20"/>',
  rotate: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 3.5v4.5H15"/>',
  // a person, for the slot's header
  person: '<circle class="f" cx="12" cy="6.5" r="3.5"/><path d="M5 21c0-4.5 3-8 7-8s7 3.5 7 8"/>',
  // Resurrect, and the mark of the Resurrected: a figure standing up out of a grave mound, arms raised (drawn for this
  // game; no faith's symbols)
  risen: '<path class="f" d="M2.5 21.5c1.6-3.2 5.2-4.8 9.5-4.8s7.9 1.6 9.5 4.8z"/><circle cx="12" cy="4.6" r="2.3"/><path d="M12 7.6v8.2M7.6 6.8 12 10.2l4.4-3.4"/>',
};
P.skepticism = P.doubt;
P.commandment = P.tablet;

// every icon name that has a chosen sign, and the sign (the picker's id) it takes. Names not here (and not a picker id
// themselves) keep their old drawing above.
export const ICON_SIGN = {
  land: 'land', paint: 'paint', water: 'water', scatter: 'veg', erase: 'erase', cave: 'cave', paw: 'animals',
  strike: 'strike', heal: 'heal', rain: 'rain', harvest: 'rain', sick: 'sick', sickness: 'sick', fire: 'fire', flood: 'flood',
  whisper: 'whisper', thought: 'thought', club: 'bless', calm: 'calm', provoke: 'provoke', favour: 'favour', hand: 'powers',
  undo: 'undo', redo: 'redo', tick: 'apply', met: 'apply', close: 'close', rotate: 'turn',
  pause: 'pause', play: 'play', menu: 'menu', log: 'scroll', scroll: 'scroll', full: 'full',
  happy: 'happy', faith: 'faith', doubt: 'skep', skepticism: 'skep', strength: 'strength', people: 'people', family: 'families',
  pray: 'prayer', hunger: 'hunger', drought: 'drought', fight: 'raid', spark: 'discovery', great: 'great', grave: 'death',
  line: 'blessed', turn: 'turning',
};
// the sign an icon name takes, or null when it keeps its old drawing
export const signOf = (name) => ICON_SIGN[name] ?? (!P[name] && hasSign(name) ? name : null);
// an old drawing pressed into a seal like a sign (for a power or token that has no chosen sign)
export const oldDraw = (name) => oldAsSign(P[name] ?? P.dot);

// clan marks: small invented prehistoric signs (zigzags, dot rows, cup and ring, tally notches), one per clan,
// so a clan never reads by its colour alone. 16 px grid, drawn with the same stroke.
const MARKS = {
  zig: '<path d="M1.5 11 5 5l3 6 3-6 3.5 6"/>',
  dots: '<path d="M3 8h.01M8 8h.01M13 8h.01" stroke-width="3"/>',
  ring: '<circle cx="8" cy="8" r="5.5"/><circle class="f full" cx="8" cy="8" r="1.8"/>',
  notch: '<path d="M3.5 3v10M8 3v10M12.5 3v10"/>',
  chev: '<path d="M2 12 8 4l6 8"/>',
  wave: '<path d="M1.5 9c1.6-2.6 3.2-2.6 4.4 0s2.8 2.6 4.2 0 2.8-2.6 4.4 0"/>',
  lattice: '<path d="M3 3l10 10M13 3 3 13M8 2.5v11"/>',
  bar: '<path d="M2.5 5.5h11M2.5 10.5h11"/>',
};
export const MARK_IDS = Object.keys(MARKS);
export function markSvg(name, size = 16) {
  return `<svg class="mk mk-${name}" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${MARKS[name] ?? MARKS.dots}</svg>`;
}

export function icon(name, size = 24, cls = '') {
  const sg = signOf(name);
  if (sg) return signSvg(sg, size, `ic-${name}${cls ? ` ${cls}` : ''}`);
  return `<svg class="ic ic-${name} ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] ?? P.dot}</svg>`;
}
export const hasIcon = (name) => !!P[name] || !!signOf(name);
// a chosen sign by the picker's id (bare, at icon size), for places that mean one sign exactly; light: pale ink
export const sign = (id, size = 24, cls = '', light = false) => signSvg(id, size, cls, { light });
// an icon pressed into its clay seal: a power in a round seal, a Reshape tool in a pillow square (TOKENS.md). A name
// with no chosen sign has its old drawing pressed in, so a row of powers stays one family.
export function sealIcon(name, size = 32, kind = 'power', cls = '') {
  const sg = signOf(name);
  const shape = kind === 'tool' ? 'A_square' : 'A_circle';
  return sealSvg(sg ? { sign: sg, shape, size, cls } : { draw: oldDraw(name), shape, size, cls });
}
