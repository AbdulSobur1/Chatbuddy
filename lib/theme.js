import React, { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { useColorScheme } from 'react-native'

// ─── Dark Palette (original) ──────────────────────────────────
export const darkColors = {
  primary: '#6c63ff',
  primaryLight: '#8b83ff',
  primaryDark: '#5a52e0',
  primaryGlow: 'rgba(108, 99, 255, 0.3)',

  accent: '#2ecc71',
  accentLight: '#40e689',
  accentDark: '#27ae60',

  danger: '#ff4757',
  dangerLight: '#ff6b7a',
  warning: '#f39c12',
  info: '#3498db',
  success: '#2ecc71',

  bg: '#0f0f23',
  bgSecondary: '#1a1a2e',
  bgTertiary: '#16213e',
  bgCard: '#1e2a45',
  bgElevated: '#243351',

  surface: '#16213e',
  surfaceHover: '#1e2a45',
  surfaceActive: '#2a2a4a',

  border: '#2a2a4a',
  borderLight: '#3a3a5a',
  borderDark: '#1a1a3e',

  textPrimary: '#ffffff',
  textSecondary: '#e0e0e0',
  textTertiary: '#a0a0b0',
  textMuted: '#666680',
  textDisabled: '#444460',

  online: '#2ecc71',
  offline: '#666680',
  away: '#f39c12',
  busy: '#ff4757',

  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  overlayHeavy: 'rgba(0, 0, 0, 0.8)',

  gradient: {
    primary: ['#6c63ff', '#5a52e0'],
    accent: ['#2ecc71', '#27ae60'],
    danger: ['#ff4757', '#e84142'],
    bg: ['#0f0f23', '#1a1a2e'],
    card: ['#16213e', '#1e2a45'],
    story: ['#6c63ff', '#2ecc71'],
    tab: ['#16213e', '#1a1a2e'],
  },

  bubble: {
    mine: '#6c63ff',
    theirs: '#2a2a4a',
    mineText: '#ffffff',
    theirsText: '#e0e0e0',
    mineTime: 'rgba(255,255,255,0.6)',
    theirsTime: 'rgba(255,255,255,0.4)',
  },
}

// ─── Light Palette ────────────────────────────────────────────
export const lightColors = {
  primary: '#6c63ff',
  primaryLight: '#8b83ff',
  primaryDark: '#5a52e0',
  primaryGlow: 'rgba(108, 99, 255, 0.2)',

  accent: '#2ecc71',
  accentLight: '#40e689',
  accentDark: '#27ae60',

  danger: '#ff4757',
  dangerLight: '#ff6b7a',
  warning: '#f39c12',
  info: '#3498db',
  success: '#2ecc71',

  bg: '#f5f5f8',
  bgSecondary: '#ffffff',
  bgTertiary: '#f0f0f5',
  bgCard: '#ffffff',
  bgElevated: '#ffffff',

  surface: '#ffffff',
  surfaceHover: '#f0f0f5',
  surfaceActive: '#e8e8ee',

  border: '#e0e0e6',
  borderLight: '#e8e8ee',
  borderDark: '#d0d0d8',

  textPrimary: '#1a1a2e',
  textSecondary: '#333350',
  textTertiary: '#666680',
  textMuted: '#9999aa',
  textDisabled: '#bbbbcc',

  online: '#2ecc71',
  offline: '#9999aa',
  away: '#f39c12',
  busy: '#ff4757',

  overlay: 'rgba(0, 0, 0, 0.4)',
  overlayLight: 'rgba(0, 0, 0, 0.15)',
  overlayHeavy: 'rgba(0, 0, 0, 0.6)',

  gradient: {
    primary: ['#6c63ff', '#5a52e0'],
    accent: ['#2ecc71', '#27ae60'],
    danger: ['#ff4757', '#e84142'],
    bg: ['#f5f5f8', '#ffffff'],
    card: ['#ffffff', '#f8f8fc'],
    story: ['#6c63ff', '#2ecc71'],
    tab: ['#ffffff', '#f8f8fc'],
  },

  bubble: {
    mine: '#6c63ff',
    theirs: '#e8e8ee',
    mineText: '#ffffff',
    theirsText: '#1a1a2e',
    mineTime: 'rgba(255,255,255,0.6)',
    theirsTime: 'rgba(0,0,0,0.35)',
  },
}

// ─── Re-export for backwards compatibility ────────────────────
export const colors = darkColors

// ─── Theme Context ─────────────────────────────────────────────
const ThemeContext = createContext({ mode: 'dark', accent: null })

// ─── Theme Preference Store (simple state with listener) ──────
let currentThemeMode = 'dark'
let themeListeners = new Set()
let customAccentColor = null // null = use default
let accentListeners = new Set()

export function setThemeMode(mode) {
  currentThemeMode = mode
  themeListeners.forEach((fn) => fn(mode))
}

export function getThemeMode() {
  return currentThemeMode
}

export function subscribeToTheme(listener) {
  themeListeners.add(listener)
  return () => themeListeners.delete(listener)
}

export function setAccentColor(hex) {
  customAccentColor = hex
  accentListeners.forEach((fn) => fn(hex))
}

export function getAccentColor() {
  return customAccentColor
}

export function subscribeToAccent(listener) {
  accentListeners.add(listener)
  return () => accentListeners.delete(listener)
}

// ─── Accent color presets ─────────────────────────────────────
export const ACCENT_PRESETS = [
  { name: 'Purple', hex: '#6c63ff' },
  { name: 'Blue', hex: '#3498db' },
  { name: 'Teal', hex: '#1abc9c' },
  { name: 'Green', hex: '#2ecc71' },
  { name: 'Lime', hex: '#a8e063' },
  { name: 'Yellow', hex: '#f1c40f' },
  { name: 'Orange', hex: '#e67e22' },
  { name: 'Red', hex: '#e74c3c' },
  { name: 'Pink', hex: '#e84393' },
  { name: 'Rose', hex: '#ff6b81' },
]

// ─── Apply accent override to a palette ───────────────────────
function applyAccent(palette, accentHex) {
  if (!accentHex) return palette

  // Generate lighter/darker variants by adjusting brightness
  const r = parseInt(accentHex.slice(1, 3), 16)
  const g = parseInt(accentHex.slice(3, 5), 16)
  const b = parseInt(accentHex.slice(5, 7), 16)

  const lighten = (factor) => {
    const lr = Math.min(255, Math.round(r + (255 - r) * factor))
    const lg = Math.min(255, Math.round(g + (255 - g) * factor))
    const lb = Math.min(255, Math.round(b + (255 - b) * factor))
    return `rgb(${lr}, ${lg}, ${lb})`
  }

  const darken = (factor) => {
    const dr = Math.round(r * (1 - factor))
    const dg = Math.round(g * (1 - factor))
    const db = Math.round(b * (1 - factor))
    return `rgb(${dr}, ${dg}, ${db})`
  }

  return {
    ...palette,
    primary: accentHex,
    primaryLight: lighten(0.25),
    primaryDark: darken(0.15),
    primaryGlow: `${accentHex}40`,
    bubble: {
      ...palette.bubble,
      mine: accentHex,
    },
    gradient: {
      ...palette.gradient,
      primary: [accentHex, darken(0.15)],
      story: [accentHex, palette.accent],
    },
  }
}

// ─── Theme Provider ────────────────────────────────────────────
export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme()
  const [mode, setMode] = useState(currentThemeMode)
  const [accent, setAccent] = useState(customAccentColor)

  useEffect(() => {
    const unsub = subscribeToTheme((m) => setMode(m))
    return unsub
  }, [])

  useEffect(() => {
    const unsub = subscribeToAccent((h) => setAccent(h))
    return unsub
  }, [])

  useEffect(() => {
    if (currentThemeMode === 'system') {
      setMode(systemScheme || 'dark')
    }
  }, [systemScheme])

  const effectiveMode = currentThemeMode === 'system' ? (systemScheme || 'dark') : currentThemeMode

  return (
    <ThemeContext.Provider value={{ mode: effectiveMode, accent }}>
      {children}
    </ThemeContext.Provider>
  )
}

// ─── Hook to get current colors ───────────────────────────────
export function useColors() {
  const { mode, accent } = useContext(ThemeContext)
  const baseColors = mode === 'light' ? lightColors : darkColors
  return useMemo(() => applyAccent(baseColors, accent), [baseColors, accent])
}

// ─── Hook to get current theme mode ───────────────────────────
export function useThemeMode() {
  return useContext(ThemeContext).mode
}

// ─── HOC for class components ────────────────────────────────
export function withThemeColors(Component) {
  return function ThemedComponent(props) {
    const colors = useColors()
    return <Component {...props} colors={colors} />
  }
}

// ─── Typography ───────────────────────────────────────────────
export const typography = {
  fontFamily: undefined,
  sizes: { xs: 10, sm: 12, md: 14, lg: 16, xl: 18, xxl: 20, xxxl: 24, display: 32, hero: 40 },
  weights: { regular: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800' },
  lineHeights: { tight: 1.2, normal: 1.4, relaxed: 1.6, loose: 1.8 },
}

// ─── Spacing (4px grid) ───────────────────────────────────────
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48, massive: 64 }

// ─── Border Radius ────────────────────────────────────────────
export const radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 9999, circle: 9999 }

// ─── Shadows ──────────────────────────────────────────────────
export const shadows = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 },
  md: { shadowColor: '#6c63ff', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  xl: { shadowColor: '#6c63ff', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 12 },
  glow: { shadowColor: '#6c63ff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 8 },
}

// ─── Animation ────────────────────────────────────────────────
export const animation = {
  duration: { fast: 150, normal: 250, slow: 400, xslow: 600 },
  easing: {
    easeInOut: { type: 'timing', duration: 250, easing: 'ease-in-out' },
    spring: { damping: 15, mass: 1, stiffness: 150 },
    springLight: { damping: 20, mass: 0.8, stiffness: 200 },
    springHeavy: { damping: 10, mass: 1.5, stiffness: 100 },
  },
}

// ─── Layout Constants ─────────────────────────────────────────
export const layout = {
  tabBarHeight: 65,
  tabBarHeightIOS: 85,
  headerHeight: 56,
  avatarSize: { sm: 32, md: 44, lg: 52, xl: 64, xxl: 80 },
  maxMessageWidth: '80%',
  screenPadding: { horizontal: 16, vertical: 12 },
  fabSize: 56,
}

// ─── Composite Theme Object (for backward compat) ─────────────
const theme = { colors, typography, spacing, radius, shadows, animation, layout }
export default theme
