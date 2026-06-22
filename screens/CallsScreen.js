import React, { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
  Modal, TextInput, Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'

export default function CallsScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewCall, setShowNewCall] = useState(false)
  const [users, setUsers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [usersLoading, setUsersLoading] = useState(false)
  const [callType, setCallType] = useState('audio')
  const [initiating, setInitiating] = useState(false)

  useFocusEffect(
    useCallback(() => { fetchCalls() }, [user])
  )

  const fetchCalls = async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('calls')
      .select('*, caller:caller_id(id, display_name), receiver:receiver_id(id, display_name)')
      .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('started_at', { ascending: false })
      .limit(50)

    if (error) console.error('fetchCalls error:', error)
    else setCalls(data || [])
    setLoading(false)
  }

  const openNewCall = async () => {
    setSearchQuery('')
    setCallType('audio')
    setShowNewCall(true)
    if (!user) return
    setUsersLoading(true)
    const { data, error } = await supabase
      .from('users')
      .select('id, display_name, last_seen')
      .neq('id', user.id)
      .order('display_name')
    if (error) console.error('fetchUsers error:', error)
    else setUsers(data || [])
    setUsersLoading(false)
  }

  const initiateCall = async (otherUserId, type) => {
    if (!otherUserId) return
    setInitiating(true)
    try {
      // Find an existing DM channel with this user
      const { data: myMemberships } = await supabase
        .from('channel_members')
        .select('channel_id, channels!inner(channel_type)')
        .eq('user_id', user.id)

      let channelId = null
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
            .maybeSingle()

          if (shared) channelId = shared.channel_id
        }
      }

      const { error } = await supabase.from('calls').insert({
        channel_id: channelId,
        caller_id: user.id,
        receiver_id: otherUserId,
        call_type: type,
        status: 'outgoing',
      })
      if (error) throw error

      setShowNewCall(false)
      Alert.alert(
        `${type === 'audio' ? 'Audio' : 'Video'} Call Started`,
        'Call logged! It will appear in your call history.'
      )
      fetchCalls()
    } catch (error) {
      Alert.alert('Call Error', error.message)
    } finally {
      setInitiating(false)
    }
  }

  const getCallInfo = (call) => {
    const isOutgoing = call.caller_id === user.id
    const otherPerson = isOutgoing ? call.receiver : call.caller
    const name = otherPerson?.display_name || 'Unknown'
    const icon = isOutgoing ? 'arrow-up' : 'arrow-down'
    const iconColor = call.status === 'answered' ? '#2ecc71' : call.status === 'missed' ? '#ff4757' : '#6c63ff'
    const type = call.call_type === 'video' ? 'videocam' : 'call'

    let statusLabel
    if (call.status === 'answered') {
      statusLabel = isOutgoing ? 'Outgoing' : 'Incoming'
      if (call.duration > 0) {
        const mins = Math.floor(call.duration / 60)
        const secs = call.duration % 60
        statusLabel += ` · ${mins}:${secs.toString().padStart(2, '0')}`
      }
    } else if (call.status === 'missed') {
      statusLabel = isOutgoing ? 'Cancelled' : 'Missed'
    } else {
      statusLabel = isOutgoing ? 'Calling...' : 'Incoming...'
    }

    return { name, icon, iconColor, type, statusLabel, otherPerson }
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
  }

  const renderCall = ({ item }) => {
    const { name, icon, iconColor, type, statusLabel } = getCallInfo(item)

    return (
      <TouchableOpacity style={styles.callItem}>
        <View style={styles.callAvatar}>
          <Text style={styles.callAvatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.callInfo}>
          <View style={styles.callNameRow}>
            <Ionicons name={icon} size={14} color={iconColor} />
            <Text style={styles.callName}>{name}</Text>
          </View>
          <Text style={styles.callStatus}>{statusLabel}</Text>
        </View>
        <View style={styles.callMeta}>
          <Text style={styles.callTime}>{formatDate(item.started_at)}</Text>
          <Ionicons name={type === 'video' ? 'videocam-outline' : 'call-outline'} size={20} color="#6c63ff" />
        </View>
      </TouchableOpacity>
    )
  }

  const filteredUsers = users.filter((u) =>
    u.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <View style={styles.container}>
      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => { setCallType('audio'); openNewCall() }}
        >
          <Ionicons name="call-outline" size={20} color="#2ecc71" />
          <Text style={[styles.actionBtnText, { color: '#2ecc71' }]}>Audio Call</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => { setCallType('video'); openNewCall() }}
        >
          <Ionicons name="videocam-outline" size={20} color="#6c63ff" />
          <Text style={[styles.actionBtnText, { color: '#6c63ff' }]}>Video Call</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#6c63ff" /></View>
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(item) => item.id}
          renderItem={renderCall}
          contentContainerStyle={calls.length === 0 && styles.center}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="call-outline" size={64} color="#333" />
              <Text style={styles.emptyTitle}>No calls yet</Text>
              <Text style={styles.emptyText}>
                Tap Audio Call or Video Call above to start
              </Text>
            </View>
          }
          refreshing={loading}
          onRefresh={fetchCalls}
        />
      )}

      {/* New Call Contact Picker Modal */}
      <Modal
        visible={showNewCall}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewCall(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {callType === 'audio' ? 'Audio' : 'Video'} Call
              </Text>
              <TouchableOpacity onPress={() => setShowNewCall(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color="#666" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search contacts..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {usersLoading ? (
              <View style={styles.center}><ActivityIndicator color="#6c63ff" size="large" /></View>
            ) : (
              <FlatList
                data={filteredUsers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.userItem}
                    onPress={() => initiateCall(item.id, callType)}
                    disabled={initiating}
                  >
                    <View style={styles.userAvatar}>
                      <Text style={styles.userAvatarText}>
                        {item.display_name?.charAt(0).toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{item.display_name || 'Unknown'}</Text>
                    </View>
                    <Ionicons
                      name={callType === 'audio' ? 'call-outline' : 'videocam-outline'}
                      size={20}
                      color="#6c63ff"
                    />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.noUsers}>
                    <Ionicons name="people-outline" size={40} color="#444" />
                    <Text style={styles.noUsersText}>
                      {searchQuery ? 'No users found' : 'No contacts yet'}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actionRow: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a',
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  actionBtnText: { fontSize: 14, fontWeight: '600' },
  callItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a',
  },
  callAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#2a2a4a',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  callAvatarText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  callInfo: { flex: 1 },
  callNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  callName: { color: '#fff', fontSize: 16, fontWeight: '500' },
  callStatus: { color: '#888', fontSize: 13, marginLeft: 20 },
  callMeta: { alignItems: 'flex-end', gap: 4 },
  callTime: { color: '#666', fontSize: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptyText: { color: '#888', fontSize: 15, textAlign: 'center', marginTop: 8 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#16213e', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%', minHeight: '50%', paddingTop: 20, paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 12,
  },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a2e',
    borderRadius: 10, marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 12,
    height: 40, borderWidth: 1, borderColor: '#2a2a4a',
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 15, padding: 0 },
  userItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    paddingHorizontal: 20, borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a',
  },
  userAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#2a2a4a',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  userAvatarText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  userInfo: { flex: 1 },
  userName: { color: '#fff', fontSize: 15, fontWeight: '500' },
  noUsers: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  noUsersText: { color: '#555', fontSize: 15, marginTop: 12 },
})
