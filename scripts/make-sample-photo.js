/**
 * Generates a sample JPEG in data/photos/ so the dry-run test has content.
 * Sharp composite: gradient background + centered text-ish block.
 */
const sharp = require('sharp')
const path = require('path')

async function main() {
  const width = 1080
  const height = 1080

  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="55%" stop-color="#0d9488"/>
      <stop offset="100%" stop-color="#0e7490"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="880" cy="180" r="220" fill="#ffffff" opacity="0.08"/>
  <circle cx="150" cy="900" r="300" fill="#ffffff" opacity="0.06"/>
  <rect x="90" y="330" width="900" height="8" rx="4" fill="#ffffff" opacity="0.85"/>
  <text x="90" y="430" font-family="DejaVu Sans, Arial, sans-serif" font-size="86" font-weight="bold" fill="#ffffff">Teachers</text>
  <text x="90" y="530" font-family="DejaVu Sans, Arial, sans-serif" font-size="86" font-weight="bold" fill="#ffffff">Lesson Plan</text>
  <rect x="90" y="590" width="900" height="8" rx="4" fill="#ffffff" opacity="0.85"/>
  <text x="90" y="680" font-family="DejaVu Sans, Arial, sans-serif" font-size="44" fill="#d1fae5">Daily lesson plans &amp; teaching tips</text>
  <text x="90" y="745" font-family="DejaVu Sans, Arial, sans-serif" font-size="44" fill="#d1fae5">@teachers_lesson_plan</text>
  <text x="90" y="960" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" fill="#a7f3d0">SAMPLE IMAGE - replace with your own photos</text>
</svg>`

  const out = path.join(__dirname, '..', 'data', 'photos', 'SAMPLE-welcome.jpg')
  await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(out)

  const meta = await sharp(out).metadata()
  console.log('created', out, `${meta.width}x${meta.height}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
