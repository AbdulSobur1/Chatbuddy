import React, { useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../lib/theme'
import Avatar from './Avatar'

// ─── CallButton (extracted to avoid re-mount on parent re-render) ──
function CallButton({ icon, color, onPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.85,
      damping: 10,
      mass: 0.4,
      stiffness: 200,
      useNativeDriver: true,
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      damping: 10,
      mass: 0.4,
      stiffness: 200,
      useNativeDriver: true,
    }).start()
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.8}
    >
      <Animated.View
        style={[
          callBtnStyles.button,
          {
            backgroundColor: `${color}15`,
            borderColor: `${color}30`,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Ionicons name={icon} size={20} color={color} />
      </Animated.View>
    </TouchableOpacity>
  )
}

// ─── ChatHeader ────────────────────────────────────────────────
export default function ChatHeader({
  channel,
  onBack,
  onAudioCall,
  onVideoCall,
  onGroupInfo,
  onMuteToggle,
  isMuted,
  online,
}) {
  const slideAnim = useRef(new Animated.Value(-80)).current
  const fadeAnim = useRef(new Animated.Value(0)).current
  const backScale = useRef(new Animated.Value(0)).current
  const titleSlide = useRef(new Animated.Value(20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 16,
        mass: 0.8,
        stiffness: 150,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(backScale, {
        toValue: 1,
        damping: 12,
        mass: 0.6,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(titleSlide, {
        toValue: 0,
        duration: 350,
        delay: 150,
        useNativeDriver: true,
      }),
    ]).start()
  }, [])

  const isDM = channel.channel_type === 'dm'
  const isGroup = channel.channel_type === 'group'
  const displayName = channel.name || 'Chat'

  // Safe defaults for optional props
  const safeIsMuted = isMuted ?? false
  const handleMuteToggle = onMuteToggle || (() => {})

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: fadeAnim,
        },
      ]}
    >
      <LinearGradient
        colors={[colors.bgSecondary, colors.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.content}>
          {/* Back Button */}
          <Animated.View
            style={[styles.backWrapper, { transform: [{ scale: backScale }] }]}
          >
            <TouchableOpacity
              onPress={onBack}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
          </Animated.View>

          {/* Avatar */}
          <View style={styles.avatarContainer}>
            <Avatar
              name={displayName}
              size="sm"
              online={online}
              showOnline={isDM}
            />
          </View>

          {/* Title & Status */}
          <Animated.View
            style={[styles.titleContainer, { transform: [{ translateX: titleSlide }] }]}
          >
            <Text style={styles.title} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {online && isDM ? 'Online' : isDM ? 'Offline' : isGroup ? 'Group' : 'Direct Message'}
            </Text>
          </Animated.View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            {isDM && (
              <>
                <CallButton icon="call-outline" color={colors.accent} onPress={onAudioCall} />
                <CallButton icon="videocam-outline" color={colors.primary} onPress={onVideoCall} />
              </>
            )}
            {isGroup && (
              <CallButton icon="people-outline" color={colors.textSecondary} onPress={onGroupInfo} />
            )}
            {/* Mute toggle */}
            <CallButton
              icon={safeIsMuted ? 'notifications-off' : 'notifications-outline'}
              color={safeIsMuted ? colors.danger : colors.textMuted}
              onPress={handleMuteToggle}
            />
          </View>
        </View>

        {/* Bottom border glow */}
        <View style={styles.borderGlow} />
      </LinearGradient>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    zIndex: 100,
    elevation: 10,
  },
  gradient: {
    paddingTop: Platform.OS === 'ios' ? 44 : 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  backWrapper: {
    marginLeft: 4,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    marginLeft: 10,
  },
  titleContainer: {
    flex: 1,
    marginLeft: 10,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 8,
  },
  borderGlow: {
    height: 1,
    backgroundColor: 'rgba(108,99,255,0.08)',
    marginHorizontal: 16,
  },
})

const callBtnStyles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
})
