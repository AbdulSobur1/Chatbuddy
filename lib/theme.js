// ─────────────────────────────────────────────────────────────
// ChatBuddy — Design System Theme
// Centralized colors, typography, spacing, shadows, animations
// ─────────────────────────────────────────────────────────────

// ─── Color Palette ──────────────────────────────────────────
export const colors = {
  // Primary
  primary: '#6c63ff',
  primaryLight: '#8b83ff',
  primaryDark: '#5a52e0',
  primaryGlow: 'rgba(108, 99, 255, 0.3)',

  // Accent
  accent: '#2ecc71',
  accentLight: '#40e689',
  accentDark: '#27ae60',

  // Semantic
  danger: '#ff4757',
  dangerLight: '#ff6b7a',
  warning: '#f39c12',
  info: '#3498db',
  success: '#2ecc71',

  // Backgrounds
  bg: '#0f0f23',
  bgSecondary: '#1a1a2e',
  bgTertiary: '#16213e',
  bgCard: '#1e2a45',
  bgElevated: '#243351',

  // Surfaces
  surface: '#16213e',
  surfaceHover: '#1e2a45',
  surfaceActive: '#2a2a4a',

  // Borders
  border: '#2a2a4a',
  borderLight: '#3a3a5a',
  borderDark: '#1a1a3e',

  // Text
  textPrimary: '#ffffff',
  textSecondary: '#e0e0e0',
  textTertiary: '#a0a0b0',
  textMuted: '#666680',
  textDisabled: '#444460',

  // Status
  online: '#2ecc71',
  offline: '#666680',
  away: '#f39c12',
  busy: '#ff4757',

  // Overlays
  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  overlayHeavy: 'rgba(0, 0, 0, 0.8)',

  // Gradients (defined as arrays for LinearGradient)
  gradient: {
    primary: ['#6c63ff', '#5a52e0'],
    accent: ['#2ecc71', '#27ae60'],
    danger: ['#ff4757', '#e84142'],
    bg: ['#0f0f23', '#1a1a2e'],
    card: ['#16213e', '#1e2a45'],
    story: ['#6c63ff', '#2ecc71'],
    tab: ['#16213e', '#1a1a2e'],
  },

  // Chat bubbles
  bubble: {
    mine: '#6c63ff',
    theirs: '#2a2a4a',
    mineText: '#ffffff',
    theirsText: '#e0e0e0',
    mineTime: 'rgba(255,255,255,0.6)',
    theirsTime: 'rgba(255,255,255,0.4)',
  },
}

// ─── Typography ─────────────────────────────────────────────
export const typography = {
  fontFamily: undefined, // Set to custom font when loaded via expo-font

  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    xxxl: 24,
    display: 32,
    hero: 40,
  },

  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },

  lineHeights: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
    loose: 1.8,
  },
}

// ─── Spacing (4px grid) ─────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
  massive: 64,
}

// ─── Border Radius ──────────────────────────────────────────
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
  circle: 9999,
}

// ─── Shadows ────────────────────────────────────────────────
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#6c63ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: '#6c63ff',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  glow: {
    shadowColor: '#6c63ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
}

// ─── Animation ──────────────────────────────────────────────
export const animation = {
  duration: {
    fast: 150,
    normal: 250,
    slow: 400,
    xslow: 600,
  },
  easing: {
    // Standard ease curves
    easeInOut: {
      type: 'timing',
      duration: 250,
      easing: 'ease-in-out',
    },
    spring: {
      damping: 15,
      mass: 1,
      stiffness: 150,
    },
    springLight: {
      damping: 20,
      mass: 0.8,
      stiffness: 200,
    },
    springHeavy: {
      damping: 10,
      mass: 1.5,
      stiffness: 100,
    },
  },
}

// ─── Layout Constants ───────────────────────────────────────
export const layout = {
  tabBarHeight: 65,
  tabBarHeightIOS: 85,
  headerHeight: 56,
  avatarSize: {
    sm: 32,
    md: 44,
    lg: 52,
    xl: 64,
    xxl: 80,
  },
  maxMessageWidth: '80%',
  screenPadding: {
    horizontal: 16,
    vertical: 12,
  },
  fabSize: 56,
}

// ─── Theme Object (composite) ───────────────────────────────
const theme = {
  colors,
  typography,
  spacing,
  radius,
  shadows,
  animation,
  layout,
}

export default theme
