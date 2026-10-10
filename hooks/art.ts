// Copyright (c) 2026 Parag Pandya. MIT License, see LICENSE.
// Swear Slap: https://github.com/paragpandyareal/swear-slap

// The slap animation, drawn as real pixels.
// Each terminal cell shows a 2 by 2 grid of pixels (the quadrant block
// characters), so a band of R rows and C columns is a 2C by 2R picture.
// A cell is about twice as tall as it is wide, so those pixels are tall:
// the scene is drawn at twice the scale across as down to keep shapes round.
// Everything here is plain maths: no DOM, no canvas, so it runs inside Claude Code.

export const DURATION = 3.0

// Every colour is one of the xterm 256-colour cube's, so a terminal without
// true colour shows it exactly rather than rounding it to a muddy neighbour.
const EMPTY = -1
const SKIN = 0xffaf87
const SKIN_LIGHT = 0xffd7af
const SKIN_LINE = 0xaf5f5f
const SKIN_SHADE = 0xd7875f
const NAIL = 0xffd7d7
const INK = 0x5f0000
const GHOST = [0x875f5f, 0xaf875f, 0xd7af87]
const PRINT = 0xd7005f
const PRINT_GLOW = 0xff5f87
const BURST = 0xffd700
const BURST_DOT = 0xffaf00
const BURST_EDGE = 0xaf0000
const TEXT = 0xffffff
const TEXT_EDGE = 0x5f0000
const STAR = 0xffff5f
const STAR_BACK = 0xd7af00
const COIN = 0xffd700
const COIN_DARK = 0xd7af00
const GLASS = 0x87d7ff
const LID = 0x875f00
const LID_TOP = 0xaf8700
const GLASS_IN = 0x5f87af
const WAVE = [0xffffaf, 0xff875f]
const SPEED = [0xffffff, 0xd7d7d7, 0xafafaf]
const FLASH_LIGHT = 0xffffff
const FLASH_DARK = 0xd70000
const SILHOUETTE = 0x000000
// the handprint darkening as it fades away at the end
const PRINT_FADE = [0xd7005f, 0xaf005f, 0x87005f, 0x5f005f]
const CRACK_FADE = [0x87afd7, 0x5f87af, 0x5f5f87, 0x3a3a3a]
const SPARKS = [0xffff5f, 0xffffff, 0xff875f, 0xff5f87]

// Scene size the art was designed in; it is scaled to whatever the band has.
const SW = 180
const SH = 96
const CX = 90
const CY = 48

type P = { x: number; y: number }

function rng(seed: number) {
  let s = (seed >>> 0) % 2147483647 || 1
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

const clamp = (p: number) => (p < 0 ? 0 : p > 1 ? 1 : p)
const lerp = (a: number, b: number, p: number) => a + (b - a) * p
const overshoot = (p: number) => {
  const k = 2.2
  const q = clamp(p) - 1
  return 1 + (k + 1) * q * q * q + k * q * q
}

type Pixels = {
  w: number
  h: number
  px: Int32Array
  // scene to pixel mapping: sy pixels per scene unit down, sx = 2 * sy across
  sx: number
  sy: number
  ox: number
  oy: number
  set: (x: number, y: number, c: number) => void
  toPx: (p: P) => P
  toScene: (x: number, y: number) => P
  // Calls fn for every pixel whose centre lands in the scene box.
  each: (minX: number, minY: number, maxX: number, maxY: number, fn: (x: number, y: number, p: P) => void) => void
}

function makePixels(w: number, h: number): Pixels {
  // the whole scene fits, centred, whatever shape the band is
  const sy = Math.min(h / SH, w / (2 * SW))
  const c: Pixels = {
    w,
    h,
    px: new Int32Array(w * h).fill(EMPTY),
    sx: 2 * sy,
    sy,
    ox: w / 2 - CX * 2 * sy,
    oy: h / 2 - CY * sy,
    set(x, y, col) {
      if (x < 0 || y < 0 || x >= c.w || y >= c.h) return
      c.px[y * c.w + x] = col
    },
    toPx(p) {
      return { x: c.ox + p.x * c.sx, y: c.oy + p.y * c.sy }
    },
    toScene(x, y) {
      return { x: (x + 0.5 - c.ox) / c.sx, y: (y + 0.5 - c.oy) / c.sy }
    },
    each(minX, minY, maxX, maxY, fn) {
      const a = c.toPx({ x: minX, y: minY })
      const b = c.toPx({ x: maxX, y: maxY })
      const x0 = Math.max(0, Math.floor(a.x) - 1)
      const y0 = Math.max(0, Math.floor(a.y) - 1)
      const x1 = Math.min(c.w - 1, Math.ceil(b.x) + 1)
      const y1 = Math.min(c.h - 1, Math.ceil(b.y) + 1)
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y, c.toScene(x, y))
    },
  }
  return c
}

// Signed distance helpers (negative inside).
function sdRoundBox(px: number, py: number, bx: number, by: number, r: number) {
  const qx = Math.abs(px) - bx + r
  const qy = Math.abs(py) - by + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
function sdCapsule(px: number, py: number, ax: number, ay: number, bx: number, by: number, r: number) {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay))
  return Math.hypot(pax - bax * h, pay - bay * h) - r
}

const FINGERS: [number, number][] = [
  [-8.4, 14],
  [-2.9, 17],
  [2.7, 16],
  [8.2, 12],
]

function fingerSd(i: number, x: number, y: number) {
  const [fx, h] = FINGERS[i]!
  return sdCapsule(x, y, fx, -6 - h + 2.6, fx, -4.6, 2.6)
}
function thumbSd(x: number, y: number) {
  // thumb sits at (-10, 7), turned -0.95 rad
  const dx = x + 10
  const dy = y - 7
  const c = Math.cos(0.95)
  const s = Math.sin(0.95)
  const lx = dx * c - dy * s
  const ly = dx * s + dy * c
  return sdCapsule(lx, ly, 0, -11.2, 0, -1.8, 2.8)
}
function palmSd(x: number, y: number) {
  return sdRoundBox(x, y - 3, 11, 11, 7)
}
function handSd(x: number, y: number) {
  let d = Math.min(palmSd(x, y), thumbSd(x, y))
  for (let i = 0; i < 4; i++) d = Math.min(d, fingerSd(i, x, y))
  return d
}

type HandStyle = 'hand' | 'ghost0' | 'ghost1' | 'ghost2' | 'print' | 'printGlow' | number

function drawHand(c: Pixels, x: number, y: number, scale: number, rot: number, style: HandStyle) {
  const reach = 32 * scale
  const pxPerUnit = c.sy * scale
  const outline = Math.max(0.9, 1.15 / pxPerUnit)
  const cos = Math.cos(-rot)
  const sin = Math.sin(-rot)
  c.each(x - reach, y - reach, x + reach, y + reach, (px, py, p) => {
    const dx = (p.x - x) / scale
    const dy = (p.y - y) / scale
    const lx = dx * cos - dy * sin
    const ly = dx * sin + dy * cos
    const d = handSd(lx, ly)
    if (typeof style === 'number') {
      if (d >= 0) return
      // keep the gaps between the fingers so the silhouette still reads as a hand
      if (ly < -5) for (let i = 0; i < 4; i++) {
        const fd = fingerSd(i, lx, ly)
        if (fd < 0 && fd > -outline * 0.9 && Math.abs(lx - FINGERS[i]![0]) > 1.6) return
      }
      c.set(px, py, style)
      return
    }
    if (style === 'print' || style === 'printGlow') {
      if (d < 0) c.set(px, py, style === 'print' ? PRINT : PRINT_GLOW)
      return
    }
    if (style !== 'hand') {
      if (d < 0) c.set(px, py, GHOST[Number(style[5])]!)
      return
    }
    if (d >= outline) return
    if (d >= 0) return c.set(px, py, INK)
    let col = SKIN
    // gaps between fingers, above the palm
    if (ly < -5 && pxPerUnit > 1.4) {
      for (let i = 0; i < 4; i++) {
        const fd = fingerSd(i, lx, ly)
        if (fd < 0 && fd > -outline * 0.9) col = INK
      }
    }
    if (col === SKIN) {
      // cel shading: a shadow along the lower right edge, a rim of light on the upper left
      const edge = 1.6 * outline
      if (handSd(lx + edge * 0.7, ly + edge) > 0) col = SKIN_SHADE
      else if (handSd(lx - edge * 0.7, ly - edge) > 0) col = SKIN_LIGHT
    }
    if (col === SKIN) {
      const hx = (lx + 4) / 5
      const hy = (ly + 1) / 4
      if (hx * hx + hy * hy < 1) col = SKIN_LIGHT
      const r1 = Math.hypot(lx + 2, ly - 10)
      if (Math.abs(r1 - 8) < outline * 0.5 && ly < 8 && lx < 4) col = SKIN_LINE
      for (const [fx, h] of FINGERS) {
        const nx = (lx - fx) / 1.6
        const ny = (ly + 3 + h) / 1.4
        if (nx * nx + ny * ny < 1) col = NAIL
      }
    }
    c.set(px, py, col)
  })
}

function fillPolygon(c: Pixels, pts: P[], col: number) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  c.each(minX, minY, maxX, maxY, (px, py, p) => {
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]!
      const b = pts[j]!
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
    }
    if (inside) c.set(px, py, col)
  })
}

// Comic print dots: a dot grid in scene units, used inside the SLAP! burst.
function halftone(c: Pixels, pts: P[], col: number, dot: number, gap: number, r: number) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  c.each(minX, minY, maxX, maxY, (px, py, p) => {
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]!
      const b = pts[j]!
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
    }
    if (!inside) return
    // offset every other row, like printed dots
    const row = Math.round(p.y / gap)
    const gx = p.x - (Math.round(p.x / gap - (row % 2) * 0.5) + (row % 2) * 0.5) * gap
    const gy = p.y - row * gap
    if (gx * gx + gy * gy < r * r) c.set(px, py, dot)
    else c.set(px, py, col)
  })
}

function fillEllipse(c: Pixels, x: number, y: number, rx: number, ry: number, col: number) {
  c.each(x - rx, y - ry, x + rx, y + ry, (px, py, p) => {
    const dx = (p.x - x) / rx
    const dy = (p.y - y) / ry
    if (dx * dx + dy * dy <= 1) c.set(px, py, col)
  })
}

function ring(c: Pixels, x: number, y: number, r: number, thick: number, col: number) {
  c.each(x - r - thick, y - r - thick, x + r + thick, y + r + thick, (px, py, p) => {
    if (Math.abs(Math.hypot(p.x - x, p.y - y) - r) < thick / 2) c.set(px, py, col)
  })
}

function line(c: Pixels, a: P, b: P, col: number) {
  const A = c.toPx(a)
  const B = c.toPx(b)
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(B.x - A.x), Math.abs(B.y - A.y))))
  for (let i = 0; i <= n; i++) c.set(Math.floor(lerp(A.x, B.x, i / n)), Math.floor(lerp(A.y, B.y, i / n)), col)
}

function star(c: Pixels, x: number, y: number, r: number, col: number) {
  const pts: P[] = []
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr })
  }
  fillPolygon(c, pts, col)
}

// A tiny 5 by 7 pixel font, just the letters the animation needs.
const GLYPHS: Record<string, string[]> = {
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
}

// Each font pixel is scale pixels tall and twice that wide, so letters stay square.
function textPixels(word: string, scale: number): { w: number; h: number; on: Set<number> } {
  const on = new Set<number>()
  const fw = 2 * scale
  const gw = 6 * fw
  const w = word.length * gw - fw
  const h = 7 * scale
  ;[...word].forEach((ch, k) => {
    const g = GLYPHS[ch]
    if (!g) return
    for (let r = 0; r < 7; r++)
      for (let q = 0; q < 5; q++)
        if (g[r]![q] === '#')
          for (let a = 0; a < scale; a++)
            for (let b = 0; b < fw; b++) on.add((r * scale + a) * 4096 + k * gw + q * fw + b)
  })
  return { w, h, on }
}

// Draws the word centred on a scene point, white with a dark edge, in pixel space.
function drawWord(c: Pixels, word: string, at: P, scale: number) {
  const t = textPixels(word, scale)
  const centre = c.toPx(at)
  const x0 = Math.round(centre.x - t.w / 2)
  const y0 = Math.round(centre.y - t.h / 2)
  for (const key of t.on) {
    const y = Math.floor(key / 4096)
    const x = key % 4096
    for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) if (!t.on.has((y + dy) * 4096 + x + dx)) c.set(x0 + x + dx, y0 + y + dy, TEXT_EDGE)
  }
  for (const key of t.on) c.set(x0 + (key % 4096), y0 + Math.floor(key / 4096), TEXT)
  return t
}

function cracks(seed: number): P[][] {
  const r = rng(seed * 7 + 3)
  const out: P[][] = []
  for (let i = 0; i < 10; i++) {
    let a = (i / 10) * Math.PI * 2 + r() * 0.5
    let x = CX
    let y = CY
    const pts: P[] = [{ x, y }]
    for (let s = 0; s < 5; s++) {
      a += (r() - 0.5) * 0.7
      const l = 6 + r() * 12
      x += Math.cos(a) * l
      y += Math.sin(a) * l * 0.8
      pts.push({ x, y })
    }
    out.push(pts)
  }
  return out
}

function jar(c: Pixels, coins: number) {
  const x = 156
  const y = 66
  const w = 20
  const h = 24
  // glass body: rounded box, pale inside
  c.each(x, y, x + w, y + h, (px, py, p) => {
    const d = sdRoundBox(p.x - x - w / 2, p.y - y - h / 2, w / 2, h / 2, 4)
    if (d < -1.2) c.set(px, py, GLASS_IN)
    else if (d < 0) c.set(px, py, GLASS)
  })
  // coins stacked inside
  for (let i = 0; i < Math.min(coins, 8); i++) fillEllipse(c, x + 6 + (i % 2) * 8, y + h - 4 - (i >> 1) * 4, 3.4, 1.8, i % 2 ? COIN : COIN_DARK)
  // a shine down the left of the glass
  line(c, { x: x + 3, y: y + 5 }, { x: x + 3, y: y + h - 6 }, 0xffffff)
  // neck and lid
  c.each(x + 4, y - 2.5, x + w - 4, y + 0.5, (px, py) => c.set(px, py, LID))
  c.each(x + 4, y - 2.5, x + w - 4, y - 1.8, (px, py) => c.set(px, py, LID_TOP))
}

export type FrameOptions = {
  /** Coins already in the jar before this slap. */
  coins: number
  /** Changes the crack pattern and sparks each time. */
  seed: number
}

/**
 * One frame of the slap at time t seconds, w pixels wide and h pixels tall.
 * Returns every pixel as 0xRRGGBB, or -1 where nothing is drawn.
 */
export function renderFrame(t: number, w: number, h: number, o: FrameOptions): { w: number; h: number; px: Int32Array } {
  const c = makePixels(w, h)
  const impact = 0.62
  // where the hand lands: low enough that the fingertips stay inside the scene
  const HX = CX
  const HY = CY + 7
  const BIG = 2.3
  const shake = rng(o.seed * 31 + Math.floor(t * 30))
  if (t > impact && t < 1.25) {
    const amp = 2.2 * (1 - clamp((t - impact) / 0.63))
    c.ox += Math.round((shake() - 0.5) * 4 * amp)
    c.oy += Math.round((shake() - 0.5) * 2 * amp)
  }

  const swing = (e: number) => ({ x: lerp(156, HX, e), y: lerp(24, HY, e), s: lerp(1.1, BIG, e), r: lerp(0.8, -0.1, e) })

  if (t < 0.45) {
    // Wind up: the hand slides in from the right, then pulls back before the swing
    const p = t / 0.45
    const back = p > 0.7 ? Math.sin(((p - 0.7) / 0.3) * Math.PI) * 6 : 0
    drawHand(c, lerp(215, 150, Math.min(1, p / 0.7)) + back, lerp(30, 26, p) - back * 0.4, 1.1, lerp(0.2, 0.8, p) + Math.sin(p * 9) * 0.04, 'hand')
  } else if (t < impact) {
    // The swing: speed lines streaming behind, one faint after-image
    const p = clamp((t - 0.45) / (impact - 0.45))
    const e = p * p * p
    const now = swing(e)
    // streaks pointing back along the swing, longer as it speeds up
    const ux = 156 - HX
    const uy = 24 - HY
    const ul = Math.hypot(ux, uy)
    const dx = ux / ul
    const dy = uy / ul
    for (let k = -4; k <= 4; k++) {
      const off = k * 4.5 * now.s
      const from = 9 * now.s + ((k * 7 + 11) % 5) * 2
      const to = from + (18 + ((k * 3 + 5) % 4) * 8) * (0.3 + p)
      const bx = now.x - dy * off
      const by = now.y + dx * off
      line(c, { x: bx + dx * from, y: by + dy * from }, { x: bx + dx * to, y: by + dy * to }, SPEED[Math.abs(k) % 3]!)
    }
    const g = swing(clamp(e - 0.18))
    drawHand(c, g.x, g.y, g.s, g.r, 'ghost2')
    drawHand(c, now.x, now.y, now.s, now.r, 'hand')
  } else if (t < impact + 0.1) {
    // Impact frames: the whole band flashes, the hand a stark silhouette
    const light = t < impact + 0.05
    c.px.fill(light ? FLASH_LIGHT : FLASH_DARK)
    drawHand(c, HX, HY, BIG, -0.1, light ? SILHOUETTE : FLASH_LIGHT)
  } else {
    const since = t - impact
    // fade the marks out over the last half second
    const fade = Math.min(3, Math.floor(clamp((t - (DURATION - 0.6)) / 0.6) * 4))
    // Shockwave
    if (since < 0.5) {
      const p = since / 0.5
      ring(c, CX, CY, lerp(8, 95, p), lerp(5, 1.5, p), p < 0.5 ? WAVE[0]! : WAVE[1]!)
    }
    // Cracked glass
    const grow = clamp(since / 0.12)
    for (const pts of cracks(o.seed)) {
      const n = Math.max(1, Math.round(grow * (pts.length - 1)))
      for (let i = 1; i <= n; i++) line(c, pts[i - 1]!, pts[i]!, CRACK_FADE[fade]!)
    }
    // The handprint left behind, pulsing
    const glow = since > 0.8 && Math.floor(t * 6) % 2 === 0
    drawHand(c, HX, HY, BIG, -0.1, fade > 0 ? PRINT_FADE[fade]! : glow ? 'printGlow' : 'print')
    // The hand itself: holds for a beat, then pulls away
    if (since < 0.3) {
      const p = clamp(since / 0.3)
      drawHand(c, lerp(HX, HX + 6, p), lerp(HY, HY - 3, p), lerp(BIG, BIG * 0.95, p), -0.1, 'hand')
    } else if (since < 0.6) {
      const p = clamp((since - 0.3) / 0.3)
      const e = p * p
      drawHand(c, lerp(HX + 6, 250, e), lerp(HY - 3, 10, e), lerp(BIG * 0.95, 1.1, e), lerp(-0.1, 0.9, e), 'hand')
    }
    // Sparks
    if (since < 1.2) {
      const r = rng(o.seed * 13 + 5)
      for (let i = 0; i < 46; i++) {
        const a = r() * Math.PI * 2
        const v = 40 + r() * 110
        const life = 0.5 + r() * 0.7
        const col = SPARKS[Math.floor(r() * 4)]!
        if (since > life) continue
        const x = CX + Math.cos(a) * v * since
        const y = CY + (Math.sin(a) * v - 30) * since + 80 * since * since
        const p = c.toPx({ x, y })
        c.set(Math.floor(p.x), Math.floor(p.y), col)
        c.set(Math.floor(p.x) + 1, Math.floor(p.y), col)
      }
    }
    // SLAP! burst
    if (since < 1.05) {
      const k = overshoot(since / 0.22) * (since > 0.8 ? 1 - clamp((since - 0.8) / 0.25) : 1)
      if (k > 0.05) {
        const tScale = Math.max(1, Math.floor(c.sy * 2.4))
        const word = textPixels('SLAP!', tScale)
        const needX = (word.w / c.sx) * 0.75
        const needY = (word.h / c.sy) * 1.1
        const wob = Math.sin(t * 20) * 0.05 - 0.08
        const pts = (grow: number): P[] => {
          const out: P[] = []
          for (let i = 0; i < 36; i++) {
            const r = i % 2 ? 0.62 : 1 + ((i * 37) % 7) / 30
            const a = (i / 36) * Math.PI * 2 + wob
            out.push({ x: CX + Math.cos(a) * r * Math.max(36, needX) * k * grow, y: CY - 6 + Math.sin(a) * r * Math.max(24, needY) * k * grow })
          }
          return out
        }
        fillPolygon(c, pts(1.12), BURST_EDGE)
        halftone(c, pts(1), BURST, BURST_DOT, 5, 1.4)
        if (k > 0.6) drawWord(c, 'SLAP!', { x: CX, y: CY - 6 }, tScale)
      }
    }
    // Dizzy stars circling the handprint
    if (since > 0.5) {
      for (let i = 0; i < 3; i++) {
        const a = t * 4.5 + i * 2.094
        const z = Math.sin(a)
        star(c, CX + Math.cos(a) * 46, CY - 14 + z * 9, z > 0 ? 10 : 7, z > 0 ? STAR : STAR_BACK)
      }
    }
    // A coin flips into the swear jar
    const landed = since > 1.5
    jar(c, o.coins + (landed ? 1 : 0))
    if (since > 0.9 && !landed) {
      const p = clamp((since - 0.9) / 0.6)
      const x = lerp(CX, 166, p)
      const y = lerp(CY, 72, p) - Math.sin(p * Math.PI) * 38
      fillEllipse(c, x, y, 3.4, Math.max(0.8, 3.4 * Math.abs(Math.cos(t * 14))), COIN)
    }
  }
  return { w: c.w, h: c.h, px: c.px }
}

const DEFAULT = 0x01000000

// The quadrant block for each mask of lit pixels: 8 top left, 4 top right,
// 2 bottom left, 1 bottom right.
const QUADRANT = [
  0x20, 0x2597, 0x2596, 0x2584, 0x259d, 0x2590, 0x259e, 0x259f,
  0x2598, 0x259a, 0x258c, 0x2599, 0x2580, 0x259c, 0x259b, 0x2588,
]
const BITS = [8, 4, 2, 1]

// How unlike two pixels are. Turning a drawn pixel into an empty one (or the
// reverse) costs more than any colour swap, so outlines keep their shape.
function unlike(a: number, b: number): number {
  if (a === b) return 0
  if (a === EMPTY || b === EMPTY) return 250000
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255)
  const dg = ((a >> 8) & 255) - ((b >> 8) & 255)
  const db = (a & 255) - (b & 255)
  return dr * dr + dg * dg + db * db
}

/**
 * Packs a frame into terminal cells: [character, colour, background] per cell,
 * four pixels per cell using quadrant blocks. A cell holds two colours, so
 * where more meet the closest pair wins. Empty pixels show the terminal itself.
 * The frame is 2C pixels wide and 2R tall for C columns and R rows.
 */
export function toCells(f: { w: number; h: number; px: Int32Array }): Uint32Array {
  const rows = Math.floor(f.h / 2)
  const cols = Math.floor(f.w / 2)
  const out = new Uint32Array(cols * rows * 3)
  const q = [0, 0, 0, 0]
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < cols; x++) {
      const top = 2 * r * f.w + 2 * x
      q[0] = f.px[top]!
      q[1] = f.px[top + 1]!
      q[2] = f.px[top + f.w]!
      q[3] = f.px[top + f.w + 1]!
      // the two colours this cell will show; empty, when used, is always the background
      let a = q[0]!
      let b = a
      const seen = [...new Set(q)]
      if (seen.length === 2) [a, b] = seen as [number, number]
      else if (seen.length > 2) {
        let best = Infinity
        for (let i = 0; i < seen.length; i++)
          for (let j = i + 1; j < seen.length; j++) {
            let cost = 0
            for (const p of q) cost += Math.min(unlike(p, seen[i]!), unlike(p, seen[j]!))
            if (cost < best) [best, a, b] = [cost, seen[i]!, seen[j]!]
          }
      }
      if (a === EMPTY) [a, b] = [b, a]
      // a is the glyph colour, b the background (or empty)
      let mask = 0
      for (let k = 0; k < 4; k++) if (unlike(q[k]!, a) <= unlike(q[k]!, b)) mask |= BITS[k]!
      const i = (r * cols + x) * 3
      if (a === EMPTY || mask === 0) {
        out[i] = 0x20
        out[i + 1] = DEFAULT
        out[i + 2] = b === EMPTY ? DEFAULT : b
      } else {
        out[i] = QUADRANT[mask]!
        out[i + 1] = a
        out[i + 2] = b === EMPTY || a === b ? DEFAULT : b
      }
    }
  }
  return out
}

export { SW as SCENE_WIDTH, SH as SCENE_HEIGHT }
