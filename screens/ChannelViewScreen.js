import React, { useState, useEffect, useMemo } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Alert, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore, useMessagesStore } from '../lib/store'
import { useColors, radius } from '../lib/theme'
import { useToast } from '../components/Toast'

export default function ChannelViewScreen({ route, navigation }) {
  const colors = useColors()
  const { channel } = route.params
  const user = useAuthStore((s) => s.user)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [followerCount, setFollowerCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const toast = useToast()

  // ── Admin Transfer ────────────────────────────────────
  const [showTransferPicker, setShowTransferPicker] = useState(false)
  const [followers, setFollowers] = useState([])
  const [transferring, setTransferring] = useState(false)

  const [currentAdminId, setCurrentAdminId] = useState(channel.created_by)
  const isAdmin = currentAdminId === user.id

  useEffect(() => { fetchMessages(); fetchChannelInfo(); checkFollowing() }, [channel.id])

  const fetchMessages = async () => {
    const { data } = await supabase.from('messages')
      .select('*, sender:sender_id(id, display_name, avatar_url)')
      .eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(50)
    if (data) setMessages(data.reverse()); setLoading(false)
  }

  const fetchChannelInfo = async () => {
    const { data } = await supabase.from('channels').select('follower_count').eq('id', channel.id).maybeSingle()
    if (data) setFollowerCount(data.follower_count)
  }

  const checkFollowing = async () => {
    const { data } = await supabase.from('channel_followers')
      .select('*').eq('channel_id', channel.id).eq('user_id', user.id).maybeSingle()
    setIsFollowing(!!data)
  }

  const handleSend = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const { error } = await supabase.from('messages').insert({
        channel_id: channel.id, sender_id: user.id, content: text.trim(),
      })
      if (error) throw error
      setText('')
      fetchMessages()
    } catch (error) {
      console.error('Admin send error:', error)
      toast.show(error.message?.includes('integer to interval') ? 'Database error — run the latest SQL migration in Supabase' : error.message || 'Failed to send', 'error')
    } finally {
      setSending(false)
    }
  }

  const toggleFollow = async () => {
    if (isFollowing && isAdmin) {
      // Admin cannot unfollow — must transfer or delete
      Alert.alert(
        'Admin Action Required',
        'As the channel admin, you cannot unfollow. You can either transfer admin rights to another follower or delete the channel.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Transfer Admin',
            onPress: async () => {
              const { data } = await supabase
                .from('channel_followers')
                .select('user_id, user:user_id(display_name)')
                .eq('channel_id', channel.id)
                .neq('user_id', user.id)
              setFollowers(data || [])
              setShowTransferPicker(true)
            },
          },
          {
            text: 'Delete Channel',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                'Delete Channel?',
                'This will permanently delete the channel and all its posts. This action cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await supabase.from('messages').delete().eq('channel_id', channel.id)
                        await supabase.from('channel_followers').delete().eq('channel_id', channel.id)
                        await supabase.from('channels').delete().eq('id', channel.id)
                        toast.show('Channel deleted', 'info')
                        navigation.goBack()
                      } catch (e) {
                        toast.show('Failed to delete channel', 'error')
                      }
                    },
                  },
                ]
              )
            },
          },
        ]
      )
      return
    }

    if (isFollowing) {
      await supabase.from('channel_followers').delete().eq('channel_id', channel.id).eq('user_id', user.id)
      setIsFollowing(false); setFollowerCount((c) => Math.max(0, c - 1))
      toast.show('Unfollowed channel', 'info')
    } else {
      await supabase.from('channel_followers').insert({ channel_id: channel.id, user_id: user.id })
      setIsFollowing(true); setFollowerCount((c) => c + 1)
      toast.show('Following channel!', 'success')
    }
  }

  const deletePost = async (messageId) => {
    Alert.alert('Delete Post', 'Remove this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('messages').delete().eq('id', messageId)
          fetchMessages()
          toast.show('Post deleted', 'info')
        },
      },
    ])
  }

  const renderMessage = ({ item }) => (
    <TouchableOpacity
      style={styles.msg}
      onLongPress={isAdmin && item.sender_id === user.id ? () => deletePost(item.id) : undefined}
      activeOpacity={isAdmin && item.sender_id === user.id ? 0.7 : 1}
    >
      <View style={styles.msgHeader}>
        <Text style={styles.sender}>{item.sender?.display_name || 'Unknown'}</Text>
        {item.sender_id === channel.created_by && (
          <View style={styles.adminBadge}><Text style={{ color: colors.primary, fontSize: 10, fontWeight: '600' }}>Admin</Text></View>
        )}
        <Text style={styles.time}>
          {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </Text>
      </View>
      {item.content && <Text style={styles.content}>{item.content}</Text>}
    </TouchableOpacity>
  )

  const styles = useMemo(() => makeStyles(colors), [colors])

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '600' }}>{channel.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
            {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.followBtn, isFollowing && { backgroundColor: colors.primary }]}
          onPress={toggleFollow}
        >
          <Text style={[styles.followText, isFollowing && { color: '#fff' }]}>
            {isFollowing ? (isAdmin ? 'Admin' : 'Following') : 'Follow'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Description */}
      {channel.description && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.textTertiary, fontSize: 14 }}>{channel.description}</Text>
        </View>
      )}

      {/* Messages */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          style={{ flex: 1 }}
          contentContainerStyle={!messages.length && { flex: 1, justifyContent: 'center', alignItems: 'center' }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="megaphone-outline" size={48} color={colors.textDisabled} />
              <Text style={{ color: colors.textMuted, fontSize: 16, marginTop: 12 }}>No posts yet</Text>
            </View>
          }
        />
      )}

      {/* Admin Input Bar */}
      {isAdmin && (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="Type an announcement..."
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendButton, sending && { opacity: 0.5 }]}
            onPress={handleSend}
            disabled={sending || !text.trim()}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Footer hint */}
      {!isAdmin && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: colors.surface, borderTopWidth: 0.5, borderTopColor: colors.border }}>
          <Ionicons name="information-circle" size={16} color={colors.textDisabled} />
          <Text style={{ color: colors.textDisabled, fontSize: 12 }}>Only admins can post.</Text>
        </View>
      )}

      {/* Transfer Admin Picker */}
      <Modal visible={showTransferPicker} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24, maxHeight: '70%' }}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
              Transfer Admin Rights
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 20 }}>
              Choose a follower to become the new admin
            </Text>
            {followers.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Ionicons name="people-outline" size={40} color={colors.textDisabled} />
                <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 8 }}>
                  No other followers to transfer to
                </Text>
              </View>
            ) : (
              <FlatList
                data={followers}
                keyExtractor={(item) => item.user_id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
                    onPress={async () => {
                      if (transferring) return
                      setTransferring(true)
                      try {
                        const newAdminName = item.user?.display_name || 'User'
                        await supabase.from('channels').update({ created_by: item.user_id }).eq('id', channel.id)
                        await supabase.from('channel_followers').delete().eq('channel_id', channel.id).eq('user_id', user.id)
                        toast.show(`Admin rights transferred to ${newAdminName}`, 'success')
                        setShowTransferPicker(false)
                        setCurrentAdminId(item.user_id)
                        setIsFollowing(false)
                        setFollowerCount((c) => Math.max(0, c - 1))
                      } catch (e) {
                        toast.show('Failed to transfer admin rights', 'error')
                      } finally {
                        setTransferring(false)
                      }
                    }}
                    disabled={transferring}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="person" size={20} color="#fff" />
                    </View>
                    <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>
                      {item.user?.display_name || 'Unknown'}
                    </Text>
                    {transferring && <ActivityIndicator size="small" color={colors.primary} />}
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity
              style={{ paddingVertical: 14, alignItems: 'center', marginTop: 8 }}
              onPress={() => setShowTransferPicker(false)}
            >
              <Text style={{ color: colors.textTertiary, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12,
    backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  followBtn: { borderRadius: 8, borderWidth: 1, borderColor: colors.primary, paddingVertical: 6, paddingHorizontal: 14, marginRight: 4 },
  followText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  msg: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  msgHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sender: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  adminBadge: { backgroundColor: `${colors.primary}20`, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  time: { color: colors.textDisabled, fontSize: 11, marginLeft: 'auto' },
  content: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 8,
    backgroundColor: colors.surface, borderTopWidth: 0.5, borderTopColor: colors.border, gap: 4,
  },
  textInput: {
    flex: 1, backgroundColor: colors.bg, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: colors.textPrimary, maxHeight: 100,
    borderWidth: 1, borderColor: colors.border,
  },
  sendButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
})
