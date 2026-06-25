import React, { useCallback, useState, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { colors, radius, shadows } from '../lib/theme'
import Avatar from '../components/Avatar'
import { ChatListItemSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'

const RECENT_THRESHOLD = 2 * 60 * 1000

export default function ChatsListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewChat, setShowNewChat] = useState(false)
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState({})
  const [lastMessages, setLastMessages] = useState({})
  const [otherUsers, setOtherUsers] = useState({})
  const toast = useToast()

  useFocusEffect(
    useCallback(() => {
      fetchDMs()
    }, [user])
  )

  useEffect(() => {
    if (!user) return
    const fetchStatuses = async () => {
      const { data } = await supabase.from('users').select('id, last_seen')
      if (data) {
        const statusMap = {}
        data.forEach((u) => {
          const isOnline = u.last_seen && Date.now() - new Date(u.last_seen).getTime() < RECENT_THRESHOLD
          statusMap[u.id] = isOnline
        })
        setOnlineUsers(statusMap)
      }
    }
    fetchStatuses()
    const interval = setInterval(fetchStatuses, 30000)
    return () => clearInterval(interval)
  }, [user])

  const fetchDMs = async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('channel_members')
      .select('channel_id, channels!inner(*)')
      .eq('user_id', user.id)

    if (error) {
      console.error('fetchDMs error:', error)
      setLoading(false)
      return
    }

    const dmChannels = data
      .map((cm) => cm.channels)
      .filter((c) => c && c.channel_type === 'dm')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    setChannels(dmChannels)
    setLoading(false)
    fetchOtherUsers(dmChannels)
  }

  const fetchOtherUsers = async (dmChannels) => {
    if (!user || dmChannels.length === 0) return
    const channelIds = dmChannels.map((c) => c.id)
    const { data: channelMembers } = await supabase
      .from('channel_members')
      .select('channel_id, user_id, user:user_id(display_name, username)')
      .in('channel_id', channelIds)
      .neq('user_id', user.id)

    if (channelMembers) {
      const otherMap = {}
      channelMembers.forEach((cm) => {
        otherMap[cm.channel_id] = cm.user
      })
      setOtherUsers(otherMap)
    }
  }

  // Fetch last message for each DM using a single batched query
  useEffect(() => {
    if (channels.length === 0) return
    const channelIds = channels.map((c) => c.id)
    const fetchLastMessages = async () => {
      // Use DISTINCT ON to get the last message per channel in one query
      const { data } = await supabase
        .from('messages')
        .select('id, channel_id, content, created_at, sender:sender_id(display_name)')
        .in('channel_id', channelIds)
        .order('created_at', { ascending: false })
        .limit(50) // Enough to cover all channels in most cases

      if (data) {
        // Take only the first message per channel (newest)
        const seen = new Set()
        const msgMap = {}
        for (const msg of data) {
          if (!seen.has(msg.channel_id)) {
            seen.add(msg.channel_id)
            msgMap[msg.channel_id] = msg
          }
        }
        setLastMessages(msgMap)
      }
    }
    fetchLastMessages()
  }, [channels])

  const searchUsersByUsername = async (query) => {
    if (!user || query.length < 2) { setUsers([]); return }
    setUsersLoading(true)
    const { data } = await supabase
      .from('users')
      .select('id, display_name, username, avatar_url, last_seen')
      .neq('id', user.id)
      .ilike('username', `%${query.toLowerCase()}%`)
      .limit(20)
    if (data) setUsers(data)
    setUsersLoading(false)
  }

  const startDM = async (otherUserId) => {
    if (!user) return null
    const { data: myMemberships } = await supabase
      .from('channel_members')
      .select('channel_id, channels!inner(channel_type)')
      .eq('user_id', user.id)

    if (myMemberships?.length > 0) {
      const dmIds = myMemberships.filter((m) => m.channels?.channel_type === 'dm').map((m) => m.channel_id)
      if (dmIds.length > 0) {
        const { data: shared } = await supabase
          .from('channel_members')
          .select('channel_id')
          .in('channel_id', dmIds)
          .eq('user_id', otherUserId)
        if (shared?.length > 0) {
          const { data: channel } = await supabase.from('channels').select('*').eq('id', shared[0].channel_id).single()
          if (channel) return channel
        }
      }
    }

    const { data: channel, error } = await supabase
      .from('channels')
      .insert({ name: 'Direct Chat', created_by: user.id, channel_type: 'dm', is_group: false })
      .select().single()
    if (error) throw error

    await supabase.from('channel_members').insert([
      { channel_id: channel.id, user_id: user.id, role: 'owner' },
      { channel_id: channel.id, user_id: otherUserId, role: 'member' },
    ])
    return channel
  }

  const handleStartChat = async (otherUserId) => {
    if (!otherUserId) return
    setCreating(true)
    try {
      const channel = await startDM(otherUserId)
      if (channel) {
        setShowNewChat(false)
        navigation.navigate('Chat', { channel })
      }
    } catch (error) {
      toast.show(error.message || 'Failed to start chat', 'error')
    } finally {
      setCreating(false)
    }
  }

  const initiateCallFromDM = async (channel, callType) => {
    const otherUser = otherUsers[channel.id]
    if (!otherUser?.id) {
      toast.show('Could not identify the other user', 'error')
      return
    }
    try {
      await supabase.from('calls').insert({
        channel_id: channel.id, caller_id: user.id, receiver_id: otherUser.id,
        call_type: callType, status: 'outgoing',
      })
      toast.show(`${callType === 'audio' ? 'Audio' : 'Video'} call initiated!`, 'success')
    } catch (error) {
      toast.show(error.message, 'error')
    }
  }

  const getLastMessagePreview = (channelId) => {
    const msg = lastMessages[channelId]
    if (!msg) return { text: 'No messages yet', time: null }
    const senderName = msg.sender?.display_name || 'Someone'
    const text = msg.content || '📎 Sent a file'
    const truncated = text.length > 40 ? text.substring(0, 40) + '...' : text
    return {
      text: `${senderName}: ${truncated}`,
      time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  }

  const renderChannel = ({ item }) => {
    const preview = getLastMessagePreview(item.id)
    const otherUser = otherUsers[item.id]
    const name = otherUser?.display_name || item.name || 'Direct Chat'
    const userId = otherUser?.id
    const isOnline = userId ? onlineUsers[userId] : undefined

    return (
      <TouchableOpacity
        style={styles.channelItem}
        onPress={() => navigation.navigate('Chat', { channel: item })}
        activeOpacity={0.7}
      >
        <Avatar
          name={name}
          size="lg"
          online={isOnline}
          showOnline
        />
        <View style={styles.channelInfo}>
          <Text style={styles.channelName} numberOfLines={1}>{name}</Text>
          <Text style={styles.lastMessage} numberOfLines={1}>{preview.text}</Text>
        </View>
        <View style={styles.metaContainer}>
          {preview.time && <Text style={styles.timeText}>{preview.time}</Text>}
          <View style={styles.callIcons}>
            <TouchableOpacity
              style={styles.callIconBtn}
              onPress={() => initiateCallFromDM(item, 'audio')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="call-outline" size={16} color={colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.callIconBtn}
              onPress={() => initiateCallFromDM(item, 'video')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="videocam-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  const renderUser = ({ item }) => {
    const isOnline = item.last_seen && Date.now() - new Date(item.last_seen).getTime() < RECENT_THRESHOLD
    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => handleStartChat(item.id)}
        activeOpacity={0.7}
      >
        <Avatar
          name={item.display_name}
          size="md"
          online={isOnline}
          showOnline
        />
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{item.display_name || 'Unknown'}</Text>
          <Text style={styles.userHandle}>@{item.username || 'unknown'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textDisabled} />
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.skeletonContainer}>
          {Array.from({ length: 8 }).map((_, i) => (
            <ChatListItemSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={channels}
          keyExtractor={(item) => item.id}
          renderItem={renderChannel}
          contentContainerStyle={channels.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubbles-outline" size={48} color={colors.textDisabled} />
              </View>
              <Text style={styles.emptyTitle}>No DMs yet</Text>
              <Text style={styles.emptyText}>Tap + to start a conversation</Text>
            </View>
          }
          refreshing={loading}
          onRefresh={fetchDMs}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => { setSearchQuery(''); setUsers([]); setShowNewChat(true) }} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* New DM Modal */}
      <Modal visible={showNewChat} transparent animationType="slide" onRequestClose={() => setShowNewChat(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Chat</Text>
              <TouchableOpacity onPress={() => setShowNewChat(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by @username..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={(v) => { setSearchQuery(v); searchUsersByUsername(v) }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setUsers([]) }}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {usersLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : (
              <FlatList
                data={users}
                keyExtractor={(item) => item.id}
                renderItem={renderUser}
                style={styles.userList}
                ListEmptyComponent={
                  <View style={styles.noUsers}>
                    <Ionicons name="people-outline" size={40} color={colors.textDisabled} />
                    <Text style={styles.noUsersText}>
                      {searchQuery.length > 0 && searchQuery.length < 2 ? 'Type at least 2 characters...'
                        : searchQuery ? 'No users found'
                        : 'Search by @username to find someone'}
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { paddingVertical: 8 },
  emptyContainer: { flex: 1 },
  skeletonContainer: { paddingTop: 8 },

  channelItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12,
  },
  channelInfo: { flex: 1, marginLeft: 12 },
  channelName: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 3 },
  lastMessage: { color: colors.textTertiary, fontSize: 14 },
  metaContainer: { alignItems: 'flex-end', marginLeft: 8, gap: 6 },
  timeText: { color: colors.textMuted, fontSize: 11 },
  callIcons: { flexDirection: 'row', gap: 6 },
  callIconBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '600', marginBottom: 8 },
  emptyText: { color: colors.textTertiary, fontSize: 15, textAlign: 'center' },

  fab: {
    position: 'absolute', right: 20, bottom: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
    ...shadows.glow,
  },

  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    maxHeight: '85%', minHeight: '50%', paddingTop: 20, paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 12,
  },
  modalTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg,
    borderRadius: radius.md, marginHorizontal: 20, marginBottom: 12,
    paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: colors.border,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, padding: 0 },

  userList: { flex: 1, paddingHorizontal: 20 },
  userItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    paddingHorizontal: 12, borderRadius: radius.md, marginBottom: 4,
  },
  userInfo: { flex: 1, marginLeft: 12 },
  userName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  userHandle: { color: colors.primary, fontSize: 13 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noUsers: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  noUsersText: { color: colors.textMuted, fontSize: 15, marginTop: 12, textAlign: 'center' },
})
