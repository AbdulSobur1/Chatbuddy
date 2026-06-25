import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import {
  View,
  Text,
  Animated,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, typography, spacing, shadows, animation } from '../lib/theme'

const ToastContext = createContext()

const ICONS = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
  warning: 'warning',
}

const COLORS = {
  success: colors.success,
  error: colors.danger,
  info: colors.info,
  warning: colors.warning,
}

let toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const { width: screenWidth } = useWindowDimensions()

  const show = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, message, type, duration }])
    return id
  }, [])

  const hide = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      {/* Toast Container */}
      <View style={styles.container} pointerEvents="box-none">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onHide={hide}
            screenWidth={screenWidth}
          />
        ))}
      </View>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onHide, screenWidth }) {
  const translateY = useRef(new Animated.Value(-100)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Animate in
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        damping: 15,
        mass: 0.8,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start()

    // Auto-hide
    const timer = setTimeout(() => {
      hide()
    }, toast.duration)

    return () => clearTimeout(timer)
  }, [])

  const hide = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onHide(toast.id))
  }

  const color = COLORS[toast.type] || COLORS.info
  const icon = ICONS[toast.type] || ICONS.info

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          transform: [{ translateY }],
          opacity,
          width: screenWidth - 32,
          borderLeftColor: color,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.message} numberOfLines={2}>
        {toast.message}
      </Text>
      <TouchableOpacity onPress={hide} style={styles.closeButton}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  )
}

// ─── Hook ────────────────────────────────────────────────────
export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderLeftWidth: 4,
    gap: 10,
    ...shadows.lg,
  },
  message: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  closeButton: {
    padding: 4,
  },
})

// ─── Helper functions for direct use ─────────────────────────
let globalShow = null
export function setGlobalToast(showFn) {
  globalShow = showFn
}

export function showToast(message, type = 'info', duration = 3000) {
  if (globalShow) {
    return globalShow(message, type, duration)
  }
  console.warn('Toast not initialized. Wrap your app with ToastProvider.')
}
