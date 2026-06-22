import React, { useCallback, useState, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, TextInput, Modal, ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../lib/store'
import { supabase } from '../lib/supabase'

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

    // Fetch the other user for each DM
    fetchOtherUsers(dmChannels)
  }

  const fetchOtherUsers = async (dmChannels) => {
    if (!user || dmChannels.length === 0) return
    const channelIds = dmChannels.map((c) => c.id)
    const { data: channelMembers } = await supabase
      .from('channel_members')
      .select('channel_id, user_id, user:user_id(display_name)')
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

  // Fetch last message for each DM
  useEffect(() => {
    channels.forEach(async (channel) => {
      const { data } = await supabase
        .from('messages')
        .select('content, created_at, sender:sender_id(display_name)')
        .eq('channel_id', channel.id)
        .order('created_at', { ascending: false })
        .limit(1)
      if (data && data.length > 0) {
        setLastMessages((prev) => ({ ...prev, [channel.id]: data[0] }))
      }
    })
  }, [channels])

  const openNewChat = async () => {
    setShowNewChat(true)
    setSearchQuery('')
    await fetchUsers()
  }

  const fetchUsers = async () => {
    if (!user) return
    setUsersLoading(true)
    const { data, error } = await supabase
      .from('users')
      .select('id, display_name, avatar_url, last_seen')
      .neq('id', user.id)
      .order('display_name')
    if (error) console.error('fetchUsers error:', error)
    else setUsers(data || [])
    setUsersLoading(false)
  }

  const startDM = async (otherUserId) => {
    if (!user) return null
    // Check if DM already exists
    const { data: myMemberships } = await supabase
      .from('channel_members')
      .select('channel_id, channels!inner(channel_type)')
      .eq('user_id', user.id)

    if (myMemberships && myMemberships.length > 0) {
      const dmIds = myMemberships
        .filter((m) => m.channels?.channel_type === 'dm')
        .map((m) => m.channel_id)

      if (dmIds.length > 0) {
        const { data: shared } = await supabase
          .from('channel_members')
          .select('channel_id')
          .in('channel_id', dmIds)
          .eq('user_id', otherUserId)

        if (shared && shared.length > 0) {
          const { data: channel } = await supabase
            .from('channels')
            .select('*')
            .eq('id', shared[0].channel_id)
            .single()
          if (channel) return channel
        }
      }
    }

    // Create new DM channel
    const { data: channel, error } = await supabase
      .from('channels')
      .insert({
        name: 'Direct Chat',
        created_by: user.id,
        channel_type: 'dm',
        is_group: false,
      })
      .select()
      .single()

    if (error) throw error

    // Add both members
    const members = [
      { channel_id: channel.id, user_id: user.id, role: 'owner' },
      { channel_id: channel.id, user_id: otherUserId, role: 'member' },
    ]

    // Insert creator first, then other user
    const { error: mError } = await supabase.from('channel_members').insert(members)
    if (mError) throw mError

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
      Alert.alert('Error', error.message)
    } finally {
      setCreating(false)
    }
  }

  const getOtherUserName = (channel) => {
    // For DMs, try to show the other person's name
    return channel.name || 'Direct Chat'
  }

  const getLastMessagePreview = (channelId) => {
    const msg = lastMessages[channelId]
    if (!msg) return 'No messages yet'
    const senderName = msg.sender?.display_name || 'Someone'
    const text = msg.content || 'Sent a file'
    return `${senderName}: ${text.length > 40 ? text.substring(0, 40) + '...' : text}`
  }

  const filteredUsers = users.filter((u) =>
    u.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const initiateCallFromDM = async (channel, callType) => {
    const otherUser = otherUsers[channel.id]
    if (!otherUser?.id) {
      Alert.alert('Error', 'Could not identify the other user')
      return
    }
    try {
      const { error } = await supabase.from('calls').insert({
        channel_id: channel.id,
        caller_id: user.id,
        receiver_id: otherUser.id,
        call_type: callType,
        status: 'outgoing',
      })
      if (error) throw error
      Alert.alert(
        `${callType === 'audio' ? 'Audio' : 'Video'} Call Started`,
        'Call logged! Check the Calls tab for history.'
      )
    } catch (error) {
      Alert.alert('Call Error', error.message)
    }
  }

  const renderChannel = ({ item }) => (
    <TouchableOpacity
      style={styles.channelItem}
      onPress={() => navigation.navigate('Chat', { channel: item })}
    >
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {getOtherUserName(item).charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={styles.channelInfo}>
        <Text style={styles.channelName}>{getOtherUserName(item)}</Text>
        <Text style={styles.lastMessage}>
          {getLastMessagePreview(item.id)}
        </Text>
      </View>
      <View style={styles.metaContainer}>
        {lastMessages[item.id] && (
          <Text style={styles.timeText}>
            {new Date(lastMessages[item.id].created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        )}
        <View style={styles.callIcons}>
          <TouchableOpacity
            style={styles.callIconBtn}
            onPress={() => initiateCallFromDM(item, 'audio')}
          >
            <Ionicons name="call-outline" size={18} color="#2ecc71" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.callIconBtn}
            onPress={() => initiateCallFromDM(item, 'video')}
          >
            <Ionicons name="videocam-outline" size={18} color="#6c63ff" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  )

  const renderUser = ({ item }) => {
    const isOnline = item.last_seen && Date.now() - new Date(item.last_seen).getTime() < RECENT_THRESHOLD
    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => handleStartChat(item.id)}
      >
        <View style={styles.userAvatarContainer}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {item.display_name?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          {isOnline && <View style={styles.onlineDot} />}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.display_name || 'Unknown'}</Text>
          <Text style={styles.userStatus}>{isOnline ? 'Online' : 'Offline'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#444" />
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        renderItem={renderChannel}
        contentContainerStyle={channels.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={64} color="#333" />
            <Text style={styles.emptyTitle}>No DMs yet</Text>
            <Text style={styles.emptyText}>Tap + to start a conversation</Text>
          </View>
        }
        refreshing={loading}
        onRefresh={fetchDMs}
      />

      <TouchableOpacity style={styles.fab} onPress={openNewChat}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* New DM Modal */}
      <Modal
        visible={showNewChat}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewChat(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.newChatHeader}>
              <Text style={styles.newChatTitle}>New Chat</Text>
              <TouchableOpacity onPress={() => setShowNewChat(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color="#666" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search users..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#666" />
                </TouchableOpacity>
              )}
            </View>

            {usersLoading ? (
              <View style={styles.usersLoading}>
                <ActivityIndicator color="#6c63ff" size="large" />
              </View>
            ) : (
              <FlatList
                data={filteredUsers}
                keyExtractor={(item) => item.id}
                renderItem={renderUser}
                style={styles.userList}
                ListEmptyComponent={
                  <View style={styles.noUsers}>
                    <Ionicons name="people-outline" size={40} color="#444" />
                    <Text style={styles.noUsersText}>
                      {searchQuery ? 'No users found' : 'No other users yet'}
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
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  list: { paddingVertical: 8 },
  emptyContainer: { flex: 1 },
  channelItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a',
  },
  avatarContainer: { position: 'relative', marginRight: 14 },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#6c63ff',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  channelInfo: { flex: 1 },
  channelName: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  lastMessage: { color: '#888', fontSize: 14 },
  metaContainer: { alignItems: 'flex-end', marginLeft: 8 },
  timeText: { color: '#666', fontSize: 12 },
  callIcons: {
    flexDirection: 'row',
    gap: 8,
  },
  callIconBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center',
  },
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  emptyText: { color: '#888', fontSize: 16, textAlign: 'center' },
  fab: {
    position: 'absolute', right: 20, bottom: 20, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#6c63ff', justifyContent: 'center',
    alignItems: 'center', elevation: 8, shadowColor: '#6c63ff',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#16213e', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%', minHeight: '50%', paddingTop: 20, paddingBottom: 34,
  },
  newChatHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 8,
  },
  newChatTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a2e',
    borderRadius: 10, marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 12,
    height: 40, borderWidth: 1, borderColor: '#2a2a4a',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 15, padding: 0 },
  userList: { flex: 1, paddingHorizontal: 20 },
  userItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    paddingHorizontal: 12, borderRadius: 12, marginBottom: 4,
  },
  userAvatarContainer: { position: 'relative', marginRight: 12 },
  userAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#2a2a4a',
    justifyContent: 'center', alignItems: 'center',
  },
  userAvatarText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0, width: 12, height: 12,
    borderRadius: 6, backgroundColor: '#2ecc71', borderWidth: 2, borderColor: '#16213e',
  },
  userInfo: { flex: 1 },
  userName: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  userStatus: { color: '#666', fontSize: 13 },
  usersLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noUsers: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  noUsersText: { color: '#555', fontSize: 15, marginTop: 12 },
})
