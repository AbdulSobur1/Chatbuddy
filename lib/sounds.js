import { createAudioPlayer } from 'expo-audio'

// ─── Generate a minimal 16-bit PCM WAV beep as base64 ─────────
// Creates a 0.08s sine wave at 660Hz, 44100Hz sample rate
function generateBeepWav() {
  const sampleRate = 44100
  const duration = 0.08
  const frequency = 660
  const numSamples = Math.floor(sampleRate * duration)
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * bitsPerSample / 8
  const blockAlign = numChannels * bitsPerSample / 8
  const dataSize = numSamples * blockAlign
  const fileSize = 44 + dataSize

  const buffer = new ArrayBuffer(fileSize)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, fileSize - 8, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)        // chunk size
  view.setUint16(20, 1, true)         // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // Generate sine wave samples with fade in/out
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    // Envelope: fade in first 5ms, fade out last 10ms
    let envelope = 1
    const fadeIn = 0.005
    const fadeOut = 0.01
    if (t < fadeIn) envelope = t / fadeIn
    if (t > duration - fadeOut) envelope = (duration - t) / fadeOut

    const sample = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.4
    const val = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + i * 2, val * 0x7FFF, true)
  }

  // Convert to base64 data URI
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return 'data:audio/wav;base64,' + btoa(binary)
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

// ─── Sound system ──────────────────────────────────────────────
let beepSound = null
let lastPlayedAt = 0
const THROTTLE_MS = 800 // play at most once per 800ms

// Global toggle — respects Settings toggle
let soundsEnabled = true
const soundListeners = new Set()

export function setSoundsEnabled(enabled) {
  soundsEnabled = enabled
  soundListeners.forEach((fn) => fn(enabled))
}

export function getSoundsEnabled() {
  return soundsEnabled
}

export function subscribeToSounds(listener) {
  soundListeners.add(listener)
  return () => soundListeners.delete(listener)
}

// Preload the beep player once
function ensurePlayer() {
  if (beepPlayer) return beepPlayer
  try {
    const player = createAudioPlayer({ uri: generateBeepWav() })
    player.volume = 0.3
    beepPlayer = player
    return player
  } catch {
    return null
  }
}

// Play a subtle typing notification sound
export async function playTypingSound() {
  if (!soundsEnabled) return

  const now = Date.now()
  if (now - lastPlayedAt < THROTTLE_MS) return
  lastPlayedAt = now

  try {
    const player = ensurePlayer()
    if (player) {
      await player.seekTo(0)
      player.play()
    }
  } catch {
    // Silently fail — typing sounds are non-critical
  }
}

// Clean up on app unmount
export async function cleanupSounds() {
  if (beepPlayer) {
    beepPlayer.remove()
    beepPlayer = null
  }
}
