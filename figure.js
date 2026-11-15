'use strict';
/* FORGE body map. A clean, faceless anatomy figure drawn as SVG: a dark silhouette with
   one panel per muscle group. Neglected groups fade to a muted red; trained groups stay
   neutral. The upper and lower body widen slightly as the matching scores grow. */

// m = how much muscle the goal builds, bf = body fat the figure drifts toward as you progress
const GOALS = {
  muscle:   { label: 'Get huge',     desc: 'Pack on as much muscle as possible.', m: 1.0,  bf: 0.35, tiers: ['Starting out', 'Lean', 'Muscular', 'Big', 'Huge'] },
  lean:     { label: 'Get lean',     desc: 'Lose fat, keep muscle, look defined.', m: 0.55, bf: 0.0,  tiers: ['Starting out', 'Toned', 'Fit', 'Defined', 'Shredded'] },
  athletic: { label: 'Get athletic', desc: 'Balanced strength, size and fitness.', m: 0.75, bf: 0.12, tiers: ['Starting out', 'Active', 'Athletic', 'Conditioned', 'Elite'] },
};
function physiqueInfo(ch, sc) {
  const g = GOALS[ch.goal] || GOALS.athletic, overall = (sc.STR + sc.PUL + sc.LEG + sc.COR) / 4;
  const idx = overall < .12 ? 0 : overall < .3 ? 1 : overall < .5 ? 2 : overall < .72 ? 3 : 4;
  return { overall, tier: g.tiers[idx], bf: lerpBf(g, overall) };
}
const lerpBf = (g, overall) => 0.45 + (g.bf - 0.45) * Math.min(1, overall * 1.4);

// ---- muscle balance colours ----
const BODY_BASE = '#3a3d44', BODY_SKIN = '#2e3035', BODY_SIL = '#202226', BODY_RED = '#c4473f';
const damageOf = h => Math.pow(Math.max(0, Math.min(1, 1 - h / .55)), .8);   // 0 = on track, 1 = badly neglected
const mixHex = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, '0')).join('');
const heatCss = h => damageOf(h) > .05 ? mixHex('#8a8e96', BODY_RED, Math.min(1, damageOf(h) * 1.3)) : '#ecebe7';

// Right half of the body in a 200-wide space (centre line x = 100); the left half is a mirror.
const BODY_SIL_PATH = 'M100 54 L108 55 Q110 66 120 72 Q140 77 153 84 Q162 95 161 112 Q163 136 161 160 Q165 184 164 206 Q161 228 157 244 Q160 258 152 269 Q142 269 140 255 L140 240 Q137 220 139 198 Q137 180 139 166 Q137 150 136 134 Q137 150 137 166 Q132 190 135 214 Q143 242 141 290 Q138 312 134 327 Q137 346 136 370 Q132 392 132 403 Q140 413 136 423 L110 423 Q108 409 114 401 Q106 372 108 336 Q104 325 106 316 Q101 290 101 246 L100 246 Z';
const BODY_SHAPES = {
  front: [
    ['', 'M108 66 L108 58 Q100 60 92 58 L92 66 Z'],
    ['Back', 'M108 68 Q122 72 134 80 L110 82 Z'],
    ['Shoulders', 'M136 80 Q155 82 158 103 Q157 117 151 124 Q145 110 133 100 Q128 89 136 80 Z'],
    ['Chest', 'M102 83 L132 83 Q140 93 139 106 Q133 121 116 124 Q104 124 102 118 Z'],
    ['Biceps', 'M146 124 Q157 130 158 150 Q156 165 150 172 Q142 167 140 150 Q140 133 146 124 Z'],
    ['', 'M150 176 Q161 186 161 206 Q158 226 152 240 L144 240 Q140 220 142 197 Q143 183 150 176 Z'],
    ['', 'M143 244 L155 244 Q158 256 151 266 Q144 264 142 254 Z'],
    ['Core', 'M102.5 128 L116 128 Q117 137 116 146 L102.5 146 Z'],
    ['Core', 'M102.5 149 L116 149 L116 166 L102.5 166 Z'],
    ['Core', 'M102.5 169 L116 169 L115 186 L102.5 186 Z'],
    ['Core', 'M102.5 189 L115 189 Q114 210 102.5 224 Z'],
    ['Core', 'M120 127 Q133 127 135 140 Q134 168 128 194 Q122 202 119 196 Q119 160 120 127 Z'],
    ['Legs', 'M103 234 Q124 215 136 216 Q142 250 138 290 Q134 312 124 320 Q112 318 108 304 Q102 272 103 234 Z', 1],
    ['Legs', 'M111 334 Q124 330 131 340 Q135 370 128 398 L117 400 Q108 370 111 334 Z', 1],
    ['', 'M115 404 L130 404 Q138 413 134 420 L112 420 Q111 410 115 404 Z', 1],
  ],
  back: [
    ['', 'M108 66 L108 58 Q100 60 92 58 L92 66 Z'],
    ['Back', 'M100 60 L108 62 Q118 72 136 80 Q120 96 104 122 L100 124 Z'],
    ['Shoulders', 'M138 80 Q155 82 158 103 Q157 117 151 124 Q143 108 132 98 Q128 88 138 80 Z'],
    ['Back', 'M104 126 Q118 102 136 98 Q141 122 134 150 Q124 176 108 190 L104 190 Z'],
    ['Back', 'M101 193 L110 193 Q114 207 112 222 L101 222 Z'],
    ['Triceps', 'M146 124 Q157 130 158 150 Q156 165 150 172 Q142 167 140 150 Q140 133 146 124 Z'],
    ['', 'M150 176 Q161 186 161 206 Q158 226 152 240 L144 240 Q140 220 142 197 Q143 183 150 176 Z'],
    ['', 'M143 244 L155 244 Q158 256 151 266 Q144 264 142 254 Z'],
    ['Glutes', 'M101 226 Q125 219 136 231 Q141 256 129 270 Q113 277 101 269 Z', 1],
    ['Legs', 'M104 276 Q124 280 137 275 Q140 300 132 320 Q120 326 110 320 Q104 300 104 276 Z', 1],
    ['Legs', 'M111 334 Q128 330 133 346 Q134 372 127 396 L117 398 Q106 372 111 334 Z', 1],
    ['', 'M115 404 L130 404 Q136 412 133 420 L112 420 Q111 410 115 404 Z', 1],
  ],
};
let _bodyId = 0;

// bodySVG(view, { heat: {group: 0..1} | null, ch, sc, width })
function bodySVG(view, o) {
  o = o || {};
  const ch = o.ch || {}, sc = o.sc || { STR: 0, PUL: 0, LEG: 0, COR: 0 }, f = ch.sex === 'f';
  const m = (GOALS[ch.goal] || GOALS.athletic).m, cl = v => Math.max(0, Math.min(1, v));
  const up = (f ? .9 : 1) * (.93 + .15 * cl((sc.STR + sc.PUL) / 2 * m)), low = (f ? 1.04 : 1) * (.95 + .1 * cl(sc.LEG * m));
  const fill = g => !g ? BODY_SKIN : o.heat ? mixHex(BODY_BASE, BODY_RED, Math.max(0, damageOf(o.heat[g] == null ? 1 : o.heat[g]) - .25) / .75 * .9) : BODY_BASE;
  const sx = k => `translate(100 0) scale(${k.toFixed(3)} 1) translate(-100 0)`;
  const id = 'b' + (++_bodyId), split = 226;
  const half = lower => BODY_SHAPES[view].filter(s => !!s[2] === lower).map(([g, d]) => `<path d="${d}" fill="${fill(g)}"/>`).join('');
  const both = inner => `${inner}<g transform="translate(200 0) scale(-1 1)">${inner}</g>`;
  const sil = `<path d="${BODY_SIL_PATH}" fill="${BODY_SIL}"/>`;
  return `<svg viewBox="36 6 128 420" width="${o.width || 100}" class="body" role="img" aria-label="${view} body map">
    <defs><clipPath id="${id}u"><rect x="-100" y="0" width="400" height="${split}"/></clipPath><clipPath id="${id}l"><rect x="-100" y="${split}" width="400" height="300"/></clipPath></defs>
    <ellipse cx="100" cy="34" rx="17" ry="22" fill="${BODY_SKIN}"/>
    <g transform="${sx(low)}"><g clip-path="url(#${id}l)">${both(sil)}</g>${both(half(true))}</g>
    <g transform="${sx(up)}"><g clip-path="url(#${id}u)">${both(sil)}</g>${both(half(false))}</g>
  </svg>`;
}
