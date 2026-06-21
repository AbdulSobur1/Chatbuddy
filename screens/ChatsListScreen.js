import React, { useCallback, useState, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, TextInput, Modal, ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore, useChannelsStore } from '../lib/store'
import { supabase } from '../lib/supabase'

const RECENT_THRESHOLD = 2 * 60 * 1000 // 2 minutes

export default function ChatsListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const { channels, loading, fetchChannels, createChannel, startDirectChat } = useChannelsStore()
  const [showNewChat, setShowNewChat] = useState(false)
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [showGroupNameInput, setShowGroupNameInput] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState({})
  const [lastMessages, setLastMessages] = useState({})

  useFocusEffect(
    useCallback(() => {
      fetchChannels()
    }, [user])
  )

  useEffect(() => {
    if (!user) return

    const fetchStatuses = async () => {
      const { data } = await supabase
        .from('users')
        .select('id, last_seen')
      if (data) {
        const statusMap = {}
        data.forEach((u) => {
          const isOnline =
            u.last_seen &&
            Date.now() - new Date(u.last_seen).getTime() < RECENT_THRESHOLD
          statusMap[u.id] = isOnline
        })
        setOnlineUsers(statusMap)
      }
    }

    fetchStatuses()
    const interval = setInterval(fetchStatuses, 30000)
    return () => clearInterval(interval)
  }, [user])

  // Fetch last message for each channel
  useEffect(() => {
    channels.forEach(async (channel) => {
      const { data } = await supabase
        .from('messages')
        .select('content, created_at, sender:sender_id(display_name)')
        .eq('channel_id', channel.id)
        .order('created_at', { ascending: false })
        .limit(1)

      if (data && data.length > 0) {
        setLastMessages((prev) => ({
          ...prev,
          [channel.id]: data[0],
        }))
      }
    })
  }, [channels])

  const openNewChat = async () => {
    setShowNewChat(true)
    setSearchQuery('')
    setSelectedUsers([])
    setShowGroupNameInput(false)
    setGroupName('')
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

    if (error) {
      console.error('fetchUsers error:', error)
    } else {
      setUsers(data || [])
    }
    setUsersLoading(false)
  }

  const toggleUser = (userId) => {
    setSelectedUsers((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId)
      }
      return [...prev, userId]
    })
  }

  const handleCreateChat = async () => {
    if (selectedUsers.length === 0) return

    setCreating(true)
    try {
      if (selectedUsers.length === 1) {
        // Direct message
        const channel = await startDirectChat(selectedUsers[0])
        if (channel) {
          setShowNewChat(false)
          navigation.navigate('Chat', { channel })
        }
      } else {
        // Group chat - need a name
        if (!showGroupNameInput) {
          setShowGroupNameInput(true)
          setCreating(false)
          return
        }
        const name = groupName.trim() || `Group (${selectedUsers.length + 1})`
        const channel = await createChannel(name, selectedUsers)
        if (channel) {
          setShowNewChat(false)
          navigation.navigate('Chat', { channel })
        }
      }
    } catch (error) {
      Alert.alert('Error', error.message)
    } finally {
      setCreating(false)
    }
  }

  const getChannelName = (channel) => {
    return channel.name || 'Unnamed Channel'
  }

  const getLastMessagePreview = (channelId) => {
    const msg = lastMessages[channelId]
    if (!msg) return 'No messages yet'
    const senderName = msg.sender?.display_name || 'Someone'
    const text = msg.content || 'Sent a file'
    return `${senderName}: ${text.length > 40 ? text.substring(0, 40) + '...' : text}`
  }

  const filteredUsers = users.filter((u) =>
    u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.id?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const renderChannel = ({ item }) => {
    return (
      <TouchableOpacity
        style={styles.channelItem}
        onPress={() => navigation.navigate('Chat', { channel: item })}
      >
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {getChannelName(item).charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.channelInfo}>
          <Text style={styles.channelName}>{getChannelName(item)}</Text>
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
        </View>
      </TouchableOpacity>
    )
  }

  const renderUser = ({ item }) => {
    const isSelected = selectedUsers.includes(item.id)
    const isOnline =
      item.last_seen &&
      Date.now() - new Date(item.last_seen).getTime() < RECENT_THRESHOLD

    return (
      <TouchableOpacity
        style={[styles.userItem, isSelected && styles.userItemSelected]}
        onPress={() => toggleUser(item.id)}
      >
        <View style={styles.userAvatarContainer}>
          <View style={[styles.userAvatar, isSelected && styles.userAvatarSelected]}>
            <Text style={styles.userAvatarText}>
              {item.display_name?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          {isOnline && <View style={styles.onlineDot} />}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.display_name || 'Unknown'}</Text>
          <Text style={styles.userStatus}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
        </View>
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
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyText}>Tap + to start a new chat</Text>
          </View>
        }
        refreshing={loading}
        onRefresh={fetchChannels}
      />

      {/* Floating action button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={openNewChat}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* New Chat Modal */}
      <Modal
        visible={showNewChat}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewChat(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.newChatHeader}>
              <Text style={styles.newChatTitle}>
                {showGroupNameInput ? 'Name Your Group' : 'New Chat'}
              </Text>
              <TouchableOpacity onPress={() => setShowNewChat(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            {showGroupNameInput ? (
              <>
                <Text style={styles.newChatSubtitle}>
                  {selectedUsers.length + 1} members will be in this group
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Group name (optional)"
                  placeholderTextColor="#666"
                  value={groupName}
                  onChangeText={setGroupName}
                  autoFocus
                  maxLength={50}
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => {
                      setShowGroupNameInput(false)
                      setGroupName('')
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.createButton]}
                    onPress={handleCreateChat}
                    disabled={creating}
                  >
                    {creating ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.createButtonText}>Create Group</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {/* Search */}
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

                {/* User list */}
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

                {/* Bottom bar */}
                <View style={styles.bottomBar}>
                  <Text style={styles.selectedCount}>
                    {selectedUsers.length > 0
                      ? `${selectedUsers.length} user${selectedUsers.length > 1 ? 's' : ''} selected`
                      : 'Select users to chat with'}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.startChatButton,
                      selectedUsers.length === 0 && styles.startChatButtonDisabled,
                    ]}
                    onPress={handleCreateChat}
                    disabled={selectedUsers.length === 0 || creating}
                  >
                    {creating ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.startChatButtonText}>
                        {selectedUsers.length > 1 ? 'Create Group' : 'Start Chat'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  list: {
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2a4a',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#6c63ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  channelInfo: {
    flex: 1,
  },
  channelName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  lastMessage: {
    color: '#888',
    fontSize: 14,
  },
  metaContainer: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  timeText: {
    color: '#666',
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6c63ff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#6c63ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#16213e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    minHeight: '60%',
    paddingTop: 20,
    paddingBottom: 34,
  },
  newChatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  newChatTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  newChatSubtitle: {
    color: '#888',
    fontSize: 14,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    padding: 0,
  },
  userList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  userItemSelected: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
  },
  userAvatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2a2a4a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarSelected: {
    backgroundColor: '#6c63ff',
  },
  userAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2ecc71',
    borderWidth: 2,
    borderColor: '#16213e',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  userStatus: {
    color: '#666',
    fontSize: 13,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#6c63ff',
    borderColor: '#6c63ff',
  },
  usersLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noUsers: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  noUsersText: {
    color: '#555',
    fontSize: 15,
    marginTop: 12,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#2a2a4a',
  },
  selectedCount: {
    color: '#888',
    fontSize: 13,
    flex: 1,
  },
  startChatButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  startChatButtonDisabled: {
    opacity: 0.4,
  },
  startChatButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a4a',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 20,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  cancelButton: {
    backgroundColor: '#2a2a4a',
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '500',
  },
  createButton: {
    backgroundColor: '#6c63ff',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
})
