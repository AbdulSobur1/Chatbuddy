import React, { useMemo } from 'react'
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColors, layout } from '../lib/theme'

const sizes = { sm: 32, md: 44, lg: 52, xl: 64, xxl: 80 }

const getInitials = (name) => {
  if (!name) return '?'
  return name.split(' ').map((n) => n.charAt(0)).join('').toUpperCase().substring(0, 2)
}

const getColorForName = (name) => {
  const avatarColors = ['#6c63ff', '#e67e22', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e74c3c', '#f39c12']
  if (!name) return avatarColors[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

export default function Avatar({ name, imageUrl, size = 'md', online, showOnline, hasUnviewed, onPress, style }) {
  const colors = useColors()
  const dimension = sizes[size] || sizes.md
  const fontSize = dimension * 0.42
  const bgColor = getColorForName(name)
  const initials = getInitials(name)
  const onlineDotSize = dimension * 0.25

  const styles = useMemo(() => StyleSheet.create({
    wrapper: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
    ring: { position: 'absolute', borderWidth: 3, top: -3, left: -3, width: dimension + 6, height: dimension + 6, borderRadius: (dimension + 6) / 2, borderColor: colors.online },
    avatarWithRing: { borderWidth: 0 },
    avatar: { width: dimension, height: dimension, borderRadius: dimension / 2, backgroundColor: imageUrl ? 'transparent' : bgColor, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    initials: { color: '#fff', fontWeight: '600', fontSize },
    onlineDot: { position: 'absolute', bottom: 0, right: 0, width: onlineDotSize, height: onlineDotSize, borderRadius: onlineDotSize / 2, backgroundColor: online ? colors.online : colors.offline, borderWidth: 2, borderColor: colors.bg },
  }), [colors, dimension, bgColor, imageUrl, online, onlineDotSize])

  const content = (
    <>
      {hasUnviewed && <View style={styles.ring} />}
      <View style={[styles.avatar, hasUnviewed && styles.avatarWithRing]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: dimension, height: dimension, borderRadius: dimension / 2 }} resizeMode="cover" />
        ) : (
          name ? <Text style={styles.initials}>{initials}</Text> : <Ionicons name="person" size={fontSize} color="#fff" />
        )}
      </View>
      {showOnline && online !== undefined && <View style={styles.onlineDot} />}
    </>
  )

  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.wrapper, style]}>{content}</TouchableOpacity>
  return <View style={[styles.wrapper, style]}>{content}</View>
}
