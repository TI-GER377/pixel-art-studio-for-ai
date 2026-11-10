// ============================================================
//  make-icon.js — 픽셀 스튜디오 앱 아이콘 생성기
//  외부 라이브러리 없이 Node 내장 zlib만 사용해 PNG를 직접 작성
//
//  실행:  node make-icon.js
//  결과:  build/icon.png  (1024×1024, 투명 배경 라운드 스퀘어)
//         build/icon.ico  (윈도우용, PNG가 삽입된 ICO)
// ============================================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─────────────────────────────────────────────
//  PNG 청크 인코딩 유틸
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
  // rgba: Buffer with length width*height*4
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8;   // bit depth
  ihdr[9]  = 6;   // color type: RGBA
  ihdr[10] = 0;   // compression
  ihdr[11] = 0;   // filter
  ihdr[12] = 0;   // interlace

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
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

function encodeICO(pngBuffer) {
  // PNG를 통째로 담는 ICO (Windows Vista 이상 지원)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // type: icon
  header.writeUInt16LE(1, 4);   // count

  const entry = Buffer.alloc(16);
  entry[0] = 0;                 // width  (0 = 256)
  entry[1] = 0;                 // height (0 = 256)
  entry[2] = 0;                 // colors
  entry[3] = 0;                 // reserved
  entry.writeUInt16LE(1, 4);    // planes
  entry.writeUInt16LE(32, 6);   // bitcount
  entry.writeUInt32LE(pngBuffer.length, 8);  // data size
  entry.writeUInt32LE(22, 12);  // offset (6 + 16)

  return Buffer.concat([header, entry, pngBuffer]);
}

// ─────────────────────────────────────────────
//  아이콘 그리기
// ─────────────────────────────────────────────
const W = 1024, H = 1024;
const buf = Buffer.alloc(W * H * 4);       // 0초기화 = 완전 투명

// macOS 스타일 라운드 스퀘어 (안쪽 여백 + 모서리 반경)
const x0 = 100, y0 = 100, side = 824, r = 180;

// 2×2 슈퍼샘플 안티앨리어싱
const SAMPLES = [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];

function roundRectCovers(xx, yy) {
  if (xx < x0 || xx > x0 + side || yy < y0 || yy > y0 + side) return 0;
  const dx = Math.max(x0 + r - xx, xx - (x0 + side - r), 0);
  const dy = Math.max(y0 + r - yy, yy - (y0 + side - r), 0);
  return (dx * dx + dy * dy <= r * r) ? 1 : 0;
}

function rrCoverage(px, py) {
  let n = 0;
  for (const s of SAMPLES) n += roundRectCovers(px + s[0], py + s[1]);
  return n * 0.25;
}

// 패널(다크) 색
const PANEL = [42, 42, 42];

// 격자/하트 레이아웃: 8×8 셀, 셀 68px
const CELL = 68;
const GX0 = 240, GY0 = 240, GCOUNT = 8;    // 240..784

// 픽셀 하트 비트맵 (8칸 × 7줄)
const HEART = [
  '.XX..XX.',
  'XXXXXXXX',
  'XXXXXXXX',
  'XXXXXXXX',
  '.XXXXXX.',
  '..XXXX..',
  '...XX...'
];
const HY0 = GY0 + Math.round((GCOUNT * CELL - HEART.length * CELL) / 2); // 274

// 하트 색상: 위쪽은 밝게, 아래쪽은 어둡게 (표현 하는 손맛)
const HEART_LIGHT  = [255, 134, 136];
const HEART_BASE   = [255,  94,  98];
const HEART_DARK   = [214,  60,  70];

// 구석에 흩어둔 '팔레트 느낌' 픽셀 {col,row,color}
const STRAY = [
  { col: 7, row: 0, c: [247, 179, 43] },   // 노랑 (하트 오른쪽 위 빈칸)
  { col: 0, row: 6, c: [ 81, 207, 102] },  // 초록 (하트 왼쪽 아래 빈칸)
  { col: 7, row: 6, c: [180,  92, 217] }   // 보라 (하트 오른쪽 아래 빈칸)
];
const straySet = new Set(STRAY.map(s => s.row * 100 + s.col));

function pixelColor(xx, yy) {
  // 하트?
  const col = Math.floor((xx - GX0) / CELL);
  const row = Math.floor((yy - HY0) / CELL);
  if (row >= 0 && row < HEART.length && col >= 0 && col < 8) {
    if (HEART[row][col] === 'X') {
      if (row <= 1) return HEART_LIGHT;
      if (row >= 4) return HEART_DARK;
      return HEART_BASE;
    }
    // 하트가 아닌 셀의 흩어진 픽셀
    if (straySet.has(row * 100 + col) && row === Math.floor(row)) {
      for (const s of STRAY) {
        if (s.col === col && s.row === row) return s.c;
      }
    }
  }

  // 격자선 (셀 경계, 얇게)
  const fx = (xx - GX0) / CELL;
  const fy = (yy - GY0) / CELL;
  const nearX = Math.abs(fx - Math.round(fx)) * CELL < 1.5;
  const nearY = Math.abs(fy - Math.round(fy)) * CELL < 1.5;
  if (col >= 0 && col <= 8 && row >= 0 && row <= 8 && (nearX || nearY)) {
    // 패널색 위에 옅은 흰색 살짝 섞은 라인
    return [69, 69, 69];
  }

  return PANEL;
}

// 픽셀 채우기
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const cov = rrCoverage(px, py);
    if (cov === 0) continue;
    const c = pixelColor(px + 0.5, py + 0.5);
    const i = (py * W + px) * 4;
    buf[i]     = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = Math.round(cov * 255);
  }
}

// ─────────────────────────────────────────────
//  저장
// ─────────────────────────────────────────────
const outDir = path.join(__dirname, 'build');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'icon.png'), encodePNG(W, H, buf));
fs.writeFileSync(path.join(outDir, 'icon.ico'), encodeICO(encodePNG(256, 256, downscaleIcon256())));

// 256×256 축소본은 sips가 나중에 하도록 놔두지 않고, 여기서 간단히 4픽셀 평균으로 만든다
function downscaleIcon256() {
  const K = 4; // 1024 → 256
  const out = Buffer.alloc(256 * 256 * 4);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let dy = 0; dy < K; dy++) {
        for (let dx = 0; dx < K; dx++) {
          const i = ((y * K + dy) * W + (x * K + dx)) * 4;
          aSum += buf[i + 3];
          // premultiply 합성 후 평균 (어두운 헤일로 방지)
          rSum += buf[i]     * buf[i + 3];
          gSum += buf[i + 1] * buf[i + 3];
          bSum += buf[i + 2] * buf[i + 3];
        }
      }
      const j = (y * 256 + x) * 4;
      if (aSum > 0) {
        out[j]     = Math.round(rSum / aSum);
        out[j + 1] = Math.round(gSum / aSum);
        out[j + 2] = Math.round(bSum / aSum);
      }
      out[j + 3] = Math.round(aSum / (K * K));
    }
  }
  return out;
}

console.log('아이콘 생성 완료:');
console.log('  ' + path.join(outDir, 'icon.png') + '  (1024×1024)');
console.log('  ' + path.join(outDir, 'icon.ico') + ' (윈도우 256×256)');
