import React, { useState, useCallback, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert, Modal,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'

export default function GroupsListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastMessages, setLastMessages] = useState({})

  useFocusEffect(
    useCallback(() => { fetchGroups() }, [user])
  )

  const fetchGroups = async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('channel_members')
      .select('channel_id, channels!inner(*)')
      .eq('user_id', user.id)

    if (error) {
      console.error('fetchGroups error:', error)
      setLoading(false)
      return
    }

    const groupChannels = data
      .map((cm) => cm.channels)
      .filter((c) => c && c.channel_type === 'group')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    setGroups(groupChannels)
    setLoading(false)
  }

  // Fetch last message for each group
  useEffect(() => {
    groups.forEach(async (channel) => {
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
  }, [groups])

  const renderGroup = ({ item }) => {
    const msg = lastMessages[item.id]
    const lastMsgPreview = msg
      ? `${msg.sender?.display_name || 'Someone'}: ${(msg.content || 'Sent a file').substring(0, 40)}`
      : 'No messages yet'

    return (
      <TouchableOpacity
        style={styles.groupItem}
        onPress={() => navigation.navigate('Chat', { channel: item })}
      >
        <View style={styles.groupAvatar}>
          <Text style={styles.groupAvatarText}>
            {item.name?.charAt(0).toUpperCase() || 'G'}
          </Text>
        </View>
        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{item.name}</Text>
          <Text style={styles.lastMessage}>{lastMsgPreview}</Text>
        </View>
        <View style={styles.metaContainer}>
          {msg && (
            <Text style={styles.timeText}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
          <TouchableOpacity
            style={styles.infoButton}
            onPress={() => navigation.navigate('GroupInfo', { channel: item })}
          >
            <Ionicons name="information-circle-outline" size={20} color="#555" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('CreateGroup')}>
          <Ionicons name="add-circle-outline" size={20} color="#6c63ff" />
          <Text style={styles.actionBtnText}>Create Group</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Invite')}>
          <Ionicons name="key-outline" size={20} color="#6c63ff" />
          <Text style={styles.actionBtnText}>Join Code</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#6c63ff" /></View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroup}
          contentContainerStyle={groups.length === 0 && styles.center}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color="#333" />
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <Text style={styles.emptyText}>Create a group or join one with an invite code</Text>
            </View>
          }
          refreshing={loading}
          onRefresh={fetchGroups}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actionRow: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(108,99,255,0.1)', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  actionBtnText: { color: '#6c63ff', fontSize: 14, fontWeight: '500' },
  groupItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a',
  },
  groupAvatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#2ecc71',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  groupAvatarText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  groupInfo: { flex: 1 },
  groupName: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  lastMessage: { color: '#888', fontSize: 14 },
  metaContainer: { alignItems: 'flex-end', marginLeft: 8, gap: 4 },
  timeText: { color: '#666', fontSize: 12 },
  infoButton: { padding: 4 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptyText: { color: '#888', fontSize: 15, marginTop: 8, textAlign: 'center' },
})
