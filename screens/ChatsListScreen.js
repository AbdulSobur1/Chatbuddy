import React, { useCallback, useState, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, TextInput, Modal, ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useAuthStore, useChannelsStore } from '../lib/store'
import { supabase } from '../lib/supabase'

const RECENT_THRESHOLD = 2 * 60 * 1000 // 2 minutes

export default function ChatsListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const { channels, loading, fetchChannels, createChannel } = useChannelsStore()
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [onlineUsers, setOnlineUsers] = useState({})
  const [lastMessages, setLastMessages] = useState({})
  const [creating, setCreating] = useState(false)

  useFocusEffect(
    useCallback(() => {
      fetchChannels()
    }, [user])
  )

  useEffect(() => {
    if (!user) return

    // Fetch online statuses
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

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return
    setCreating(true)
    try {
      await createChannel(newChannelName.trim(), [user.id])
      setNewChannelName('')
      setShowNewChannel(false)
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

  const renderChannel = ({ item }) => {
    const isOnline = item.is_group ? false : onlineUsers[item.id]
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

  return (
    <View style={styles.container}>
      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        renderItem={renderChannel}
        contentContainerStyle={channels.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
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
        onPress={() => setShowNewChannel(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* New Channel Modal */}
      <Modal
        visible={showNewChannel}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewChannel(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Channel</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Channel name"
              placeholderTextColor="#666"
              value={newChannelName}
              onChangeText={setNewChannelName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setNewChannelName('')
                  setShowNewChannel(false)
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.createButton]}
                onPress={handleCreateChannel}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.createButtonText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
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
  fabText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalContent: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a4a',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
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
