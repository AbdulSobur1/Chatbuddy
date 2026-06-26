import React, { useState, useRef, useEffect, useMemo } from 'react'
import { View, TextInput, Text, Animated, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColors, radius } from '../lib/theme'

export default function Input({ label, placeholder, value, onChangeText, error, icon, secureTextEntry, keyboardType, autoCapitalize, autoCorrect, multiline, maxLength, hint, containerStyle, inputStyle, ...props }) {
  const colors = useColors()
  const [isFocused, setIsFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const labelAnim = useRef(new Animated.Value(value ? 1 : 0)).current
  const inputRef = useRef(null)

  useEffect(() => {
    Animated.spring(labelAnim, { toValue: value ? 1 : 0, damping: 20, mass: 0.5, stiffness: 200, useNativeDriver: false }).start()
  }, [value])

  const handleFocus = () => {
    setIsFocused(true)
    Animated.spring(labelAnim, { toValue: 1, damping: 20, mass: 0.5, stiffness: 200, useNativeDriver: false }).start()
  }

  const handleBlur = () => {
    setIsFocused(false)
    if (!value) Animated.spring(labelAnim, { toValue: 0, damping: 20, mass: 0.5, stiffness: 200, useNativeDriver: false }).start()
  }

  const labelTop = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [16, -8] })
  const labelSize = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 12] })
  const labelColor = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [error ? '#ff4757' : colors.textMuted, error ? '#ff4757' : isFocused ? colors.primary : colors.textMuted] })

  const borderColor = error ? '#ff4757' : isFocused ? colors.primary : colors.border
  const isPassword = secureTextEntry

  const styles = useMemo(() => StyleSheet.create({
    container: { marginBottom: 16, position: 'relative' },
    label: { position: 'absolute', left: 16, fontWeight: '500', zIndex: 10, backgroundColor: colors.bgTertiary, paddingHorizontal: 4 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgTertiary, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, minHeight: multiline ? 100 : 56 },
    input: { flex: 1, fontSize: 16, color: colors.textPrimary, paddingVertical: 16, paddingLeft: icon ? 8 : 0, textAlignVertical: multiline ? 'top' : 'center' },
    eyeButton: { padding: 4 },
    feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, marginLeft: 4 },
    errorText: { color: '#ff4757', fontSize: 12 },
    hintText: { color: colors.textMuted, fontSize: 12, marginTop: 6, marginLeft: 4 },
  }), [colors, multiline])

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Animated.Text style={[styles.label, { top: labelTop, fontSize: labelSize, color: labelColor }]} onPress={() => inputRef.current?.focus()}>
          {label}
        </Animated.Text>
      )}
      <View style={[styles.inputWrapper, { borderColor }, isFocused && { borderWidth: 2 }, error && { borderColor: '#ff4757' }]}>
        {icon && <Ionicons name={icon} size={20} color={isFocused ? colors.primary : colors.textMuted} style={{ marginRight: 4 }} />}
        <TextInput
          ref={inputRef} style={[styles.input, inputStyle]}
          placeholder={isFocused ? placeholder : ''} placeholderTextColor={colors.textMuted}
          value={value} onChangeText={onChangeText} onFocus={handleFocus} onBlur={handleBlur}
          secureTextEntry={isPassword && !showPassword} keyboardType={keyboardType}
          autoCapitalize={autoCapitalize || 'none'} autoCorrect={autoCorrect ?? false}
          multiline={multiline} maxLength={maxLength} {...props}
        />
        {isPassword && value ? (
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <View style={styles.feedbackRow}><Ionicons name="alert-circle" size={14} color="#ff4757" /><Text style={styles.errorText}>{error}</Text></View> : hint ? <Text style={styles.hintText}>{hint}</Text> : null}
    </View>
  )
}
