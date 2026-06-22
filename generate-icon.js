// Generate ChatBuddy app icon (jimp v1 API)
const { Jimp } = require('jimp')
const path = require('path')

const SIZE = 1024

async function main() {
  const assetsDir = path.join(__dirname, 'assets')

  // --- Main icon (1024x1024) ---
  const icon = new Jimp({ width: SIZE, height: SIZE, color: '#1a1a2e' })

  // Accent circle
  const circle = new Jimp({ width: Math.round(SIZE * 0.9), height: Math.round(SIZE * 0.9), color: '#6c63ff' })
  icon.composite(circle, Math.round(SIZE * 0.05), Math.round(SIZE * 0.05))

  // Chat bubble (white inner)
  const bubble = new Jimp({ width: Math.round(SIZE * 0.5), height: Math.round(SIZE * 0.5), color: '#ffffff' })
  icon.composite(bubble, Math.round(SIZE * 0.25), Math.round(SIZE * 0.15))

  // Inner accent circle
  const inner = new Jimp({ width: Math.round(SIZE * 0.3), height: Math.round(SIZE * 0.3), color: '#6c63ff' })
  icon.composite(inner, Math.round(SIZE * 0.35), Math.round(SIZE * 0.25))

  // Dots
  for (let i = 0; i < 3; i++) {
    const dot = new Jimp({ width: Math.round(SIZE * 0.06), height: Math.round(SIZE * 0.06), color: '#8b83ff' })
    icon.composite(dot, Math.round(SIZE * 0.3 + i * SIZE * 0.15), Math.round(SIZE * 0.72))
  }

  await icon.write(path.join(assetsDir, 'icon.png'))
  console.log('✓ icon.png')

  // --- Adaptive icon foreground ---
  const fg = new Jimp({ width: SIZE, height: SIZE, color: '#00000000' })
  const fgCircle = new Jimp({ width: Math.round(SIZE * 0.78), height: Math.round(SIZE * 0.78), color: '#6c63ff' })
  fg.composite(fgCircle, Math.round(SIZE * 0.11), Math.round(SIZE * 0.11))
  await fg.write(path.join(assetsDir, 'android-icon-foreground.png'))
  console.log('✓ android-icon-foreground.png')

  // --- Adaptive icon background ---
  const bg = new Jimp({ width: SIZE, height: SIZE, color: '#1a1a2e' })
  await bg.write(path.join(assetsDir, 'android-icon-background.png'))
  console.log('✓ android-icon-background.png')

  // --- Monochrome ---
  const mono = new Jimp({ width: SIZE, height: SIZE, color: '#00000000' })
  const monoCircle = new Jimp({ width: Math.round(SIZE * 0.78), height: Math.round(SIZE * 0.78), color: '#ffffff' })
  mono.composite(monoCircle, Math.round(SIZE * 0.11), Math.round(SIZE * 0.11))
  await mono.write(path.join(assetsDir, 'android-icon-monochrome.png'))
  console.log('✓ android-icon-monochrome.png')

  // --- Splash icon (2048x2048) ---
  const splash = new Jimp({ width: 2048, height: 2048, color: '#1a1a2e' })
  const splashEl = new Jimp({ width: 512, height: 512, color: '#6c63ff' })
  splash.composite(splashEl, (2048 - 512) / 2, (2048 - 512) / 2)
  await splash.write(path.join(assetsDir, 'splash-icon.png'))
  console.log('✓ splash-icon.png')

  // --- Favicon (48x48) ---
  const favicon = new Jimp({ width: 48, height: 48, color: '#6c63ff' })
  await favicon.write(path.join(assetsDir, 'favicon.png'))
  console.log('✓ favicon.png')

  console.log('\nAll icons generated successfully!')
}

main().catch(console.error)
