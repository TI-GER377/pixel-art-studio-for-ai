#!/usr/bin/env node
// ============================================================
//  cli.js — 픽셀 스튜디오 CLI 모드 (헤드리스 렌더러)
//
//  창을 띄우지 않고, JSON "그림 지시서"를 PNG로 변환한다.
//  AI 에이전트(코파일럿, 오픈코더 등)가 코드로 픽셀 아트를
//  만들 때 쓰면 된다. 순수 Node.js — 맥/윈도우/리눅스 공용.
//
//  사용법:
//    node cli.js draw 지시서.json -o 결과.png
//    node cli.js help
//
//  지시서 예시(test-draw.json):
//    {
//      "grid": 16,
//      "pixelScale": 32,
//      "ops": [
//        { "op": "rect",  "x": 0, "y": 0, "w": 16, "h": 16, "color": "#1E1E1E" },
//        { "op": "circle", "cx": 8, "cy": 8, "r": 5, "color": "#FF5C5C" },
//        { "op": "set",    "x": 3,  "y": 4,  "color": "#FFFFFF" },
//        { "op": "line",   "x1": 0, "y1": 0, "x2": 15, "y2": 15, "color": "#48D1C4" }
//      ],
//      "output": "out.png"
//    }
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─────────────────────────────────────────────
//  PNG 인코더 (외부 의존성 0)
// ─────────────────────────────────────────────
function crc32(buf) {
  if (!crc32.table) {
    crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crc32.table[n] = c;
    }
  }
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crc32.table[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;                              // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ─────────────────────────────────────────────
//  색 파싱: "#RRGGBB" 또는 "#RRGGBBAA"
// ─────────────────────────────────────────────
function parseColor(c) {
  if (typeof c !== 'string') return null;
  const m = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(c.trim());
  if (!m) return null;
  const h = m[1];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

// ─────────────────────────────────────────────
//  셀 지정 헬퍼
// ─────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function parseColorStrict(c, snippet) {
  const col = parseColor(c);
  if (col === null) {
    throw new Error('색 형식이 잘못됐습니다: ' + JSON.stringify(c) +
      ' (#RRGGBB 또는 #RRGGBBAA 형식이어야 함) — 위치: ' + snippet);
  }
  return col;
}

// ─────────────────────────────────────────────
//  렌더러: 지시서 → 셀 배열 → PNG
// ─────────────────────────────────────────────
function render(spec) {
  if (typeof spec !== 'object' || spec === null) {
    throw new Error('지시서(JSON)가 올바르지 않습니다');
  }
  if (!Array.isArray(spec.ops)) {
    throw new Error('"ops" 배열이 필요합니다 — 예: "ops": [{ "op": "set", ... }, ...]');
  }

  const GRID = clamp(Math.round(spec.grid || 16), 4, 128);
  const SCALE = clamp(Math.round(spec.pixelScale || 32), 1, 256);
  const SIZE = GRID * SCALE;

  // 셀 데이터: null(투명) 또는 [r,g,b,a]
  const pixels = new Array(GRID * GRID).fill(null);

  const putCell = (x, y, col) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;   // 범위 밖은 무시
    // 투명 지우기는 null, 그 외는 색
    pixels[y * GRID + x] = col;
  };

  const needColor = (o) => parseColorStrict(o.color, 'op="' + o.op + '"');

  let opIndex = 0;
  for (const o of spec.ops) {
    opIndex++;
    const label = 'ops[' + (opIndex - 1) + ']';
    if (!o || typeof o.op !== 'string') {
      throw new Error(label + ': "op" 항목이 필요합니다');
    }
    const clampI = (v) => (v === undefined || v === null) ? 0 : Math.round(v);

    switch (o.op) {
      case 'clear': {
        for (let i = 0; i < pixels.length; i++) pixels[i] = null;
        break;
      }
      // 전체 채우기 (기본 색 넣기)
      case 'fill': {
        const c = needColor(o);
        for (let i = 0; i < pixels.length; i++) pixels[i] = c;
        break;
      }
      // 한 칸 찍기
      case 'set':
      case 'pixel': {
        putCell(clampI(o.x), clampI(o.y), needColor(o));
        break;
      }
      // 사각 채우기 / 외곽선만
      case 'rect': {
        const c = needColor(o);
        const x0 = clampI(o.x), y0 = clampI(o.y);
        const w = Math.max(1, clampI(o.w === undefined ? 1 : o.w));
        const h = Math.max(1, clampI(o.h === undefined ? 1 : o.h));
        for (let y = y0; y < y0 + h; y++) {
          for (let x = x0; x < x0 + w; x++) {
            if (o.outline) {
              if (x !== x0 && x !== x0 + w - 1 && y !== y0 && y !== y0 + h - 1) continue;
            }
            putCell(x, y, c);
          }
        }
        break;
      }
      // 지우기(투명하게) — 영역
      case 'erase': {
        const x0 = clampI(o.x), y0 = clampI(o.y);
        const w = Math.max(1, clampI(o.w === undefined ? 1 : o.w));
        const h = Math.max(1, clampI(o.h === undefined ? 1 : o.h));
        for (let y = y0; y < y0 + h; y++) {
          for (let x = x0; x < x0 + w; x++) {
            putCell(x, y, null);
          }
        }
        break;
      }
      // 선 (브레센햄)
      case 'line': {
        const c = needColor(o);
        let x1 = clampI(o.x1 !== undefined ? o.x1 : o.from ? o.from[0] : 0);
        let y1 = clampI(o.y1 !== undefined ? o.y1 : o.from ? o.from[1] : 0);
        let x2 = clampI(o.x2 !== undefined ? o.x2 : o.to ? o.to[0] : 0);
        let y2 = clampI(o.y2 !== undefined ? o.y2 : o.to ? o.to[1] : 0);
        const dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
        const dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
        let err = dx + dy;
        for (;;) {
          putCell(x1, y1, c);
          if (x1 === x2 && y1 === y2) break;
          const e2 = 2 * err;
          if (e2 >= dy) { err += dy; x1 += sx; }
          if (e2 <= dx) { err += dx; y1 += sy; }
        }
        break;
      }
      // 원 (채우기/외곽선)
      case 'circle': {
        const c = needColor(o);
        const cx = clampI(o.cx), cy = clampI(o.cy);
        const r = Math.max(1, clampI(o.r));
        if (o.outline) {
          // 브레센햄 원 외곽선
          let x = r, y = 0, err = 1 - r;
          while (x >= y) {
            putCell(cx + x, cy + y, c); putCell(cx + y, cy + x, c);
            putCell(cx - y, cy + x, c); putCell(cx - x, cy + y, c);
            putCell(cx - x, cy - y, c); putCell(cx - y, cy - x, c);
            putCell(cx + y, cy - x, c); putCell(cx + x, cy - y, c);
            y++;
            if (err < 0) err += 2 * y + 1;
            else { x--; err += 2 * (y - x) + 1; }
          }
        } else {
          for (let y = cy - r; y <= cy + r; y++) {
            for (let x = cx - r; x <= cx + r; x++) {
              const dx2 = x - cx, dy2 = y - cy;
              if (dx2 * dx2 + dy2 * dy2 <= r * r) putCell(x, y, c);
            }
          }
        }
        break;
      }
      // 대칭 복제 (수직 중앙 기준 좌/우 반전 복사)
      case 'mirror': {
        const dir = (o.mode === 'vertical') ? 'v' : 'h';
        for (let y = 0; y < GRID; y++) {
          for (let x = 0; x < GRID; x++) {
            const v = pixels[y * GRID + x];
            if (v === null) continue;
            if (dir === 'h') {
              const mx = GRID - 1 - x;
              if (pixels[y * GRID + mx] === null) putCell(mx, y, v);
            } else {
              const my = GRID - 1 - y;
              if (pixels[my * GRID + x] === null) putCell(x, my, v);
            }
          }
        }
        break;
      }
      default:
        throw new Error(label + ': 알 수 없는 op "' + o.op + '" — 지원: fill, clear, set(pixel), rect, erase, line, circle, mirror');
    }
  }

  // 픽셀 확대 후 PNG 생성
  const img = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const c = pixels[y * GRID + x];
      if (!c) continue;
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const i = ((y * SCALE + sy) * SIZE + (x * SCALE + sx)) * 4;
          img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2];
          // 알파 합성: 이 렌더러는 배경이 투명이므로 그대로 씀
          img[i + 3] = c[3];
        }
      }
    }
  }

  return { png: encodePNG(SIZE, SIZE, img), GRID, SIZE };
}

// ─────────────────────────────────────────────
//  CLI 진입점
// ─────────────────────────────────────────────
const HELP = `
🎨 픽셀 스튜디오 CLI (헤드리스) — AI용 픽셀 아트 렌더러

사용법:
  node cli.js draw <지시서.json> [-o 출력.png]

지시서 형식(JSON):
  {
    "grid": 16,            // 그리드 크기 (4~128, 기본 16)
    "pixelScale": 32,      // 1픽셀당 확대 배율 (1~256, 기본 32)
    "output": "out.png",   // 기본 출력 경로 ( -o 로 덮어쓸 수 있음 )
    "ops": [               // 아래에서 위 순서대로 적용
      { "op": "fill",   "color": "#2A2A2A" },
      { "op": "rect",   "x": 2, "y": 2, "w": 4, "h": 4, "color": "#FF5C5C" },
      { "op": "rect",   "x": 2, "y": 2, "w": 4, "h": 4, "color": "#FFFFFF", "outline": true },
      { "op": "erase",  "x": 3, "y": 3, "w": 2, "h": 2 },
      { "op": "set",    "x": 10, "y": 5, "color": "#48D1C4" },
      { "op": "line",   "x1": 0, "y1": 15, "x2": 15, "y2": 0, "color": "#7C6CFF" },
      { "op": "circle", "cx": 8, "cy": 8, "r": 4, "color": "#F7B32B", "outline": true },
      { "op": "mirror", "mode": "horizontal" }
    ]
  }

지원 op: fill, clear, set(=pixel), rect(outline 옵션), erase, line, circle(outline 옵션), mirror
색 형식: "#RRGGBB" 또는 "#RRGGBBAA"
예시: node cli.js draw sprite.json -o sprite.png
`;

function main() {
  const args = process.argv.slice(2);
  const cmd = (args[0] || 'help').toLowerCase();

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return 0;
  }
  if (cmd === 'version' || cmd === '--version') {
    console.log('pixel-art-studio cli 1.0.0');
    return 0;
  }

  if (cmd !== 'draw') {
    console.error('알 수 없는 명령: ' + cmd + '\n사용법: node cli.js draw <지시서.json> [-o 결과.png]');
    return 1;
  }

  // 인자 파싱
  let specPath = null, outPath = null;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--out') {
      outPath = args[++i];
      if (!outPath) { console.error('-o 뒤에는 출력 파일 경로가 필요합니다'); return 1; }
    } else if (!specPath) {
      specPath = args[i];
    } else {
      console.error('인자가 너무 많습니다: ' + args[i]);
      return 1;
    }
  }
  if (!specPath) { console.error('지시서 JSON 파일 경로가 필요합니다\n' + HELP); return 1; }

  let raw;
  try {
    raw = fs.readFileSync(specPath, 'utf8');
  } catch (e) {
    console.error('지시서 파일을 읽을 수 없습니다: ' + specPath + ' (' + e.message + ')');
    return 1;
  }

  let spec;
  try {
    spec = JSON.parse(raw);
  } catch (e) {
    console.error('JSON 파싱 실패: ' + e.message + ' — 지시서 문법을 확인하세요');
    return 1;
  }

  try {
    const { png, GRID, SIZE } = render(spec);
    const out = outPath || spec.output;
    if (!out) {
      console.error('출력 경로가 없습니다 — 지시서에 "output"을 넣거나 -o 옵션을 쓰세요');
      return 1;
    }
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, png);
    console.log('✅ PNG 생성 완료: ' + path.resolve(out) + '  (그리드 ' + GRID + '×' + GRID + ' → ' + SIZE + '×' + SIZE + 'px)');
    return 0;
  } catch (e) {
    console.error('렌더 실패: ' + e.message);
    return 1;
  }
}

process.exit(main());
