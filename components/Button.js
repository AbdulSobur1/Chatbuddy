import React, { useRef, useMemo } from 'react'
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, Animated } from 'react-native'
import { useColors, shadows } from '../lib/theme'

const sizes = { sm: { py: 8, px: 14, fs: 13 }, md: { py: 12, px: 20, fs: 15 }, lg: { py: 16, px: 24, fs: 16 } }

export default function Button({ title, onPress, variant = 'primary', size = 'md', loading = false, disabled = false, icon, fullWidth = false, style, textStyle }) {
  const colors = useColors()
  const scaleAnim = useRef(new Animated.Value(1)).current
  const sizeConfig = sizes[size] || sizes.md
  const isDisabled = disabled || loading

  const config = useMemo(() => ({
    primary: { bg: colors.primary, text: '#fff', border: colors.primary, shadow: shadows.md },
    secondary: { bg: 'transparent', text: colors.primary, border: colors.border, shadow: null },
    ghost: { bg: 'transparent', text: colors.textMuted, border: 'transparent', shadow: null },
    danger: { bg: colors.danger, text: '#fff', border: colors.danger, shadow: shadows.md },
    accent: { bg: colors.accent, text: '#fff', border: colors.accent, shadow: shadows.md },
  }[variant] || { bg: colors.primary, text: '#fff', border: colors.primary, shadow: shadows.md }), [colors, variant])

  const btnStyles = useMemo(() => StyleSheet.create({
    button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, gap: 6 },
    text: { fontWeight: '600' },
    disabled: { opacity: 0.5 },
    fullWidth: { width: '100%' },
  }), [])

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, fullWidth && btnStyles.fullWidth]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.97, damping: 15, mass: 0.5, stiffness: 200, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, damping: 15, mass: 0.5, stiffness: 200, useNativeDriver: true }).start()}
        disabled={isDisabled} activeOpacity={0.8}
        style={[btnStyles.button, { backgroundColor: config.bg, borderColor: config.border, paddingVertical: sizeConfig.py, paddingHorizontal: sizeConfig.px }, config.shadow, variant === 'secondary' && { borderWidth: 1 }, isDisabled && btnStyles.disabled, fullWidth && btnStyles.fullWidth, style]}
      >
        {loading ? <ActivityIndicator color={config.text} size="small" /> : (
          <>{icon && <>{icon}</>}<Text style={[{ color: config.text, fontSize: sizeConfig.fs }, icon && { marginLeft: 8 }, textStyle]}>{title}</Text></>
        )}
      </TouchableOpacity>
    </Animated.View>
  )
}
