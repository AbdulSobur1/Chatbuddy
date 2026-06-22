import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'

export default function ChannelViewScreen({ route, navigation }) {
  const { channel } = route.params
  const user = useAuthStore((s) => s.user)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [followerCount, setFollowerCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)

  useEffect(() => {
    fetchMessages()
    fetchChannelInfo()
    checkFollowing()
  }, [channel.id])

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, sender:sender_id(id, display_name, avatar_url)')
      .eq('channel_id', channel.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) setMessages(data.reverse())
    setLoading(false)
  }

  const fetchChannelInfo = async () => {
    const { data } = await supabase
      .from('channels')
      .select('follower_count')
      .eq('id', channel.id)
      .single()
    if (data) setFollowerCount(data.follower_count)
  }

  const checkFollowing = async () => {
    const { data } = await supabase
      .from('channel_followers')
      .select('*')
      .eq('channel_id', channel.id)
      .eq('user_id', user.id)
      .maybeSingle()
    setIsFollowing(!!data)
  }

  const toggleFollow = async () => {
    if (isFollowing) {
      await supabase.from('channel_followers').delete()
        .eq('channel_id', channel.id)
        .eq('user_id', user.id)
      setIsFollowing(false)
      setFollowerCount((c) => Math.max(0, c - 1))
    } else {
      await supabase.from('channel_followers').insert({
        channel_id: channel.id, user_id: user.id,
      })
      setIsFollowing(true)
      setFollowerCount((c) => c + 1)
    }
  }

  const renderMessage = ({ item }) => {
    const isAdmin = item.sender_id === channel.created_by

    return (
      <View style={styles.messageItem}>
        <View style={styles.messageHeader}>
          <Text style={styles.senderName}>
            {item.sender?.display_name || 'Unknown'}
          </Text>
          {isAdmin && (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          )}
          <Text style={styles.messageTime}>
            {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </Text>
        </View>
        {item.content && (
          <Text style={styles.messageContent}>{item.content}</Text>
        )}
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{channel.name}</Text>
          <Text style={styles.headerSubtitle}>
            {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.followBtn, isFollowing && styles.followingBtn]}
          onPress={toggleFollow}
        >
          <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Channel Description */}
      {channel.description && (
        <View style={styles.descriptionBar}>
          <Text style={styles.descriptionText}>{channel.description}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#6c63ff" /></View>
      ) : (
        <View style={styles.messagesContainer}>
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={messages.length === 0 ? styles.center : { paddingBottom: 16 }}
            style={{ flex: 1 }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="megaphone-outline" size={48} color="#444" />
                <Text style={styles.emptyText}>No posts yet</Text>
              </View>
            }
          />
        </View>
      )}

      {/* Footer note */}
      <View style={styles.footer}>
        <Ionicons name="information-circle" size={16} color="#555" />
        <Text style={styles.footerText}>
          This is a broadcast channel. Only admins can post.
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messagesContainer: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8,
    paddingVertical: 12, backgroundColor: '#16213e',
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a',
  },
  backButton: { padding: 4 },
  headerInfo: { flex: 1, marginLeft: 8 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  headerSubtitle: { color: '#888', fontSize: 13, marginTop: 2 },
  followBtn: {
    borderRadius: 8, borderWidth: 1, borderColor: '#6c63ff',
    paddingVertical: 6, paddingHorizontal: 14, marginRight: 4,
  },
  followingBtn: { backgroundColor: '#6c63ff' },
  followBtnText: { color: '#6c63ff', fontSize: 13, fontWeight: '600' },
  followingBtnText: { color: '#fff' },
  descriptionBar: {
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#16213e',
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a',
  },
  descriptionText: { color: '#aaa', fontSize: 14, lineHeight: 20 },
  messageItem: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a',
  },
  messageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6,
  },
  senderName: { color: '#6c63ff', fontSize: 14, fontWeight: '600' },
  adminBadge: {
    backgroundColor: 'rgba(108,99,255,0.2)', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  adminBadgeText: { color: '#6c63ff', fontSize: 10, fontWeight: '600' },
  messageTime: { color: '#555', fontSize: 11, marginLeft: 'auto' },
  messageContent: { color: '#ddd', fontSize: 15, lineHeight: 22 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: '#555', fontSize: 16, marginTop: 12 },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, backgroundColor: '#16213e',
    borderTopWidth: 0.5, borderTopColor: '#2a2a4a',
  },
  footerText: { color: '#555', fontSize: 12 },
})
