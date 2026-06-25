import React, { useState, useEffect } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'
import { colors } from '../lib/theme'

export default function ChannelViewScreen({ route, navigation }) {
  const { channel } = route.params
  const user = useAuthStore((s) => s.user)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [followerCount, setFollowerCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)

  useEffect(() => { fetchMessages(); fetchChannelInfo(); checkFollowing() }, [channel.id])

  const fetchMessages = async () => {
    const { data } = await supabase.from('messages').select('*, sender:sender_id(id, display_name, avatar_url)').eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(50)
    if (data) setMessages(data.reverse()); setLoading(false)
  }

  const fetchChannelInfo = async () => {
    const { data } = await supabase.from('channels').select('follower_count').eq('id', channel.id).maybeSingle()
    if (data) setFollowerCount(data.follower_count)
  }

  const checkFollowing = async () => {
    const { data } = await supabase.from('channel_followers').select('*').eq('channel_id', channel.id).eq('user_id', user.id).maybeSingle()
    setIsFollowing(!!data)
  }

  const toggleFollow = async () => {
    if (isFollowing) {
      await supabase.from('channel_followers').delete().eq('channel_id', channel.id).eq('user_id', user.id)
      setIsFollowing(false); setFollowerCount((c) => Math.max(0, c - 1))
    } else {
      await supabase.from('channel_followers').insert({ channel_id: channel.id, user_id: user.id })
      setIsFollowing(true); setFollowerCount((c) => c + 1)
    }
  }

  const renderMessage = ({ item }) => (
    <View style={styles.msg}>
      <View style={styles.msgHeader}>
        <Text style={styles.sender}>{item.sender?.display_name || 'Unknown'}</Text>
        {item.sender_id === channel.created_by && <View style={styles.admin}><Text style={{ color: colors.primary, fontSize: 10, fontWeight: '600' }}>Admin</Text></View>}
        <Text style={styles.time}>{new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Text>
      </View>
      {item.content && <Text style={styles.content}>{item.content}</Text>}
    </View>
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={28} color={colors.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '600' }}>{channel.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{followerCount} {followerCount === 1 ? 'follower' : 'followers'}</Text>
        </View>
        <TouchableOpacity style={[styles.followBtn, isFollowing && { backgroundColor: colors.primary }]} onPress={toggleFollow}>
          <Text style={[styles.followText, isFollowing && { color: '#fff' }]}>{isFollowing ? 'Following' : 'Follow'}</Text>
        </TouchableOpacity>
      </View>
      {channel.description && <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ color: colors.textTertiary, fontSize: 14 }}>{channel.description}</Text></View>}
      {loading ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={colors.primary} /></View> : (
        <FlatList data={messages} keyExtractor={(item) => item.id} renderItem={renderMessage} style={{ flex: 1 }}
          contentContainerStyle={!messages.length && { flex: 1, justifyContent: 'center', alignItems: 'center' }}
          ListEmptyComponent={<View style={{ alignItems: 'center' }}><Ionicons name="megaphone-outline" size={48} color={colors.textDisabled} /><Text style={{ color: colors.textMuted, fontSize: 16, marginTop: 12 }}>No posts yet</Text></View>} />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: colors.surface, borderTopWidth: 0.5, borderTopColor: colors.border }}>
        <Ionicons name="information-circle" size={16} color={colors.textDisabled} /><Text style={{ color: colors.textDisabled, fontSize: 12 }}>Only admins can post.</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  followBtn: { borderRadius: 8, borderWidth: 1, borderColor: colors.primary, paddingVertical: 6, paddingHorizontal: 14, marginRight: 4 },
  followText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  msg: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  msgHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sender: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  admin: { backgroundColor: `${colors.primary}20`, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  time: { color: colors.textDisabled, fontSize: 11, marginLeft: 'auto' },
  content: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
})
