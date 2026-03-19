// BBK Korea PWA 아이콘 생성 스크립트 (외부 의존성 없음)
import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── CRC32 ────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[i] = c
}
function crc32(buf) {
  let crc = 0xffffffff
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// ─── PNG 청크 빌더 ─────────────────────────────────────────────
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crcBuf])
}

// ─── PNG 생성 ──────────────────────────────────────────────────
// BBK 블루 (#2563EB) 배경 + 흰색 "B" 픽셀 아트
function makePNG(size) {
  const BG = [37, 99, 235]   // #2563EB
  const FG = [255, 255, 255] // white

  // 'B' 문자를 size 기준 비율로 그리기
  const px = (x, y) => {
    const s = size
    const pad = Math.round(s * 0.22)
    const w = Math.round(s * 0.56)
    const h = Math.round(s * 0.56)
    const lx = pad                         // left x
    const ty = Math.round(s * 0.22)       // top y
    const thick = Math.max(2, Math.round(s * 0.07))

    const rx = lx + w                      // right x
    const my = ty + Math.round(h / 2)     // mid y
    const by = ty + h                     // bottom y

    const rInner = Math.round(s * 0.07)   // bulge radius

    // left vertical bar
    if (x >= lx && x < lx + thick && y >= ty && y <= by) return true

    // top bar
    if (y >= ty && y < ty + thick && x >= lx && x <= rx - rInner) return true
    // top right bulge
    const tcx = rx - rInner, tcy = ty + rInner
    if (Math.hypot(x - tcx, y - tcy) <= rInner + thick * 0.5 && x >= tcx && y <= tcy) return true

    // mid bar
    if (y >= my && y < my + thick && x >= lx && x <= rx - rInner) return true
    const mcx = rx - rInner, mcy = my + rInner
    if (Math.hypot(x - mcx, y - mcy) <= rInner + thick * 0.5 && x >= mcx && y <= mcy) return true

    // bottom bar
    if (y > by - thick && y <= by && x >= lx && x <= rx - rInner) return true
    const bcx = rx - rInner, bcy = by - rInner
    if (Math.hypot(x - bcx, y - bcy) <= rInner + thick * 0.5 && x >= bcx && y >= bcy) return true

    // right top half vertical
    if (x >= rx - thick && x <= rx && y >= ty && y <= my) return true
    // right bottom half vertical
    if (x >= rx - thick && x <= rx && y >= my && y <= by) return true

    return false
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // RGB

  const rowLen = 1 + size * 3
  const raw = Buffer.alloc(size * rowLen)
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const off = y * rowLen + 1 + x * 3
      const color = px(x, y) ? FG : BG

      // 모서리 둥글게: 반지름 size*0.15
      const r = size * 0.15
      const dx = Math.min(x, size - 1 - x)
      const dy = Math.min(y, size - 1 - y)
      const isCorner = dx < r && dy < r && Math.hypot(dx - r, dy - r) > r

      if (isCorner) {
        // 투명도 처리 없이 그냥 배경색 (흰 배경과 블렌딩)
        raw[off] = 255; raw[off + 1] = 255; raw[off + 2] = 255
      } else {
        raw[off] = color[0]; raw[off + 1] = color[1]; raw[off + 2] = color[2]
      }
    }
  }

  const idat = deflateSync(raw, { level: 9 })

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ─── 실행 ──────────────────────────────────────────────────────
const outDir = join(__dirname, 'public', 'icons')
mkdirSync(outDir, { recursive: true })

for (const size of [192, 512]) {
  const file = join(outDir, `icon-${size}x${size}.png`)
  writeFileSync(file, makePNG(size))
  console.log(`✓ ${file}`)
}
console.log('아이콘 생성 완료!')
