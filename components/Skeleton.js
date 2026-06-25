import React, { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet } from 'react-native'
import { colors, radius } from '../lib/theme'

function Shimmer({ width, height, borderRadius = radius.sm, style }) {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    )
    animation.start()
    return () => animation.stop()
  }, [])

  return (
    <Animated.View
      style={[
        {
          width: width || '100%',
          height: height || 20,
          borderRadius,
          backgroundColor: colors.surfaceHover,
          opacity,
        },
        style,
      ]}
    />
  )
}

// ─── Chat List Item Skeleton ─────────────────────────────────
export function ChatListItemSkeleton() {
  return (
    <View style={skeletonStyles.chatItem}>
      <Shimmer width={52} height={52} borderRadius={26} />
      <View style={skeletonStyles.chatContent}>
        <Shimmer width="60%" height={16} />
        <Shimmer width="85%" height={12} style={{ marginTop: 6 }} />
      </View>
      <Shimmer width={40} height={12} />
    </View>
  )
}

// ─── Message Bubble Skeleton ─────────────────────────────────
export function MessageBubbleSkeleton({ isMine }) {
  return (
    <View
      style={[
        skeletonStyles.messageRow,
        isMine && skeletonStyles.messageRowMine,
      ]}
    >
      <View
        style={[
          skeletonStyles.messageBubble,
          isMine
            ? { borderBottomRightRadius: 4, alignItems: 'flex-end' }
            : { borderBottomLeftRadius: 4 },
          {
            maxWidth: '75%',
            alignSelf: isMine ? 'flex-end' : 'flex-start',
          },
        ]}
      >
        <Shimmer
          width={Math.random() * 120 + 80}
          height={14}
          borderRadius={4}
        />
        <Shimmer
          width={40}
          height={10}
          borderRadius={4}
          style={{ marginTop: 8, alignSelf: 'flex-end' }}
        />
      </View>
    </View>
  )
}

// ─── Profile Card Skeleton ───────────────────────────────────
export function ProfileCardSkeleton() {
  return (
    <View style={skeletonStyles.profileCard}>
      <Shimmer width={56} height={56} borderRadius={28} />
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Shimmer width="50%" height={18} />
        <Shimmer width="70%" height={13} style={{ marginTop: 4 }} />
      </View>
    </View>
  )
}

// ─── Channel/Group List Skeleton ─────────────────────────────
export function ListItemSkeleton() {
  return (
    <View style={skeletonStyles.chatItem}>
      <Shimmer width={48} height={48} borderRadius={24} />
      <View style={skeletonStyles.chatContent}>
        <Shimmer width="45%" height={16} />
        <Shimmer width="70%" height={12} style={{ marginTop: 6 }} />
      </View>
    </View>
  )
}

// ─── Full Page Skeleton ──────────────────────────────────────
export function PageSkeleton({ type = 'list' }) {
  if (type === 'chat') {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <MessageBubbleSkeleton key={i} isMine={i % 3 === 0} />
        ))}
      </View>
    )
  }

  return (
    <View style={{ padding: 16 }}>
      {type === 'profile' && <ProfileCardSkeleton />}
      {Array.from({ length: 6 }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </View>
  )
}

// ─── Story / Updates Screen Skeleton ──────────────────────
export function StorySkeleton() {
  return (
    <View style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
        <Shimmer width={72} height={72} borderRadius={36} />
        <Shimmer width={72} height={72} borderRadius={36} />
        <Shimmer width={72} height={72} borderRadius={36} />
      </View>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 14 }}>
          <Shimmer width={52} height={52} borderRadius={26} />
          <View style={{ flex: 1 }}>
            <Shimmer width="40%" height={16} />
            <Shimmer width="60%" height={12} style={{ marginTop: 4 }} />
          </View>
        </View>
      ))}
    </View>
  )
}

const skeletonStyles = StyleSheet.create({
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  chatContent: {
    flex: 1,
  },
  messageRow: {
    marginVertical: 4,
  },
  messageRowMine: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 24,
  },
})

export default Shimmer
