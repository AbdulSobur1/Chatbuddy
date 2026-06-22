import React, { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'

const STATUS_DURATION = 24 * 60 * 60 * 1000 // 24 hours

export default function UpdatesScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const [statuses, setStatuses] = useState([])
  const [myStatuses, setMyStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [creating, setCreating] = useState(false)
  const [viewingStatus, setViewingStatus] = useState(null)
  const [viewerNames, setViewerNames] = useState('')

  useFocusEffect(
    useCallback(() => { fetchStatuses() }, [user])
  )

  const fetchStatuses = async () => {
    if (!user) return
    setLoading(true)

    // My own active statuses
    const { data: mine } = await supabase
      .from('status_updates')
      .select('*')
      .eq('user_id', user.id)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    setMyStatuses(mine || [])

    // Statuses from people I've chatted with (are channel members with me)
    const { data: myChannels } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', user.id)

    if (myChannels && myChannels.length > 0) {
      const channelIds = myChannels.map((c) => c.channel_id)
      const { data: otherMembers } = await supabase
        .from('channel_members')
        .select('user_id')
        .in('channel_id', channelIds)
        .neq('user_id', user.id)

      if (otherMembers && otherMembers.length > 0) {
        const userIds = [...new Set(otherMembers.map((m) => m.user_id))]
        const { data: statusData } = await supabase
          .from('status_updates')
          .select('*, user:user_id(id, display_name)')
          .in('user_id', userIds)
          .gte('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })

        setStatuses(statusData || [])
      }
    }

    setLoading(false)
  }

  const createStatus = async () => {
    if (!statusText.trim()) return
    setCreating(true)
    try {
      await supabase.from('status_updates').insert({
        user_id: user.id,
        content: statusText.trim(),
        media_type: 'text',
      })
      setShowCreate(false)
      setStatusText('')
      fetchStatuses()
    } catch (e) {
      Alert.alert('Error', e.message)
    } finally {
      setCreating(false)
    }
  }

  const deleteStatus = async (statusId) => {
    Alert.alert('Delete Status', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('status_updates').delete().eq('id', statusId)
          fetchStatuses()
        },
      },
    ])
  }

  const viewStatus = async (status) => {
    setViewingStatus(status)

    // Record view
    await supabase.from('status_views').upsert(
      { status_id: status.id, viewer_id: user.id },
      { onConflict: 'status_id, viewer_id' }
    )

    // Get viewer names
    const { data: views } = await supabase
      .from('status_views')
      .select('viewer:viewer_id(display_name)')
      .eq('status_id', status.id)

    if (views) {
      setViewerNames(views.map((v) => v.viewer?.display_name || 'Someone').join(', '))
    }
  }

  const hasActiveStatus = myStatuses.length > 0

  // Group statuses by user
  const groupedStatuses = {}
  statuses.forEach((s) => {
    const uid = s.user_id
    if (!groupedStatuses[uid]) {
      groupedStatuses[uid] = { user: s.user, statuses: [s] }
    } else {
      groupedStatuses[uid].statuses.push(s)
    }
  })

  const statusList = Object.values(groupedStatuses)

  const getTimeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const renderMyStatus = () => (
    <TouchableOpacity style={styles.myStatusCard} onPress={() => setShowCreate(true)}>
      <View style={[styles.statusAvatar, hasActiveStatus && styles.activeStatusAvatar]}>
        <Ionicons
          name={hasActiveStatus ? 'checkmark-circle' : 'add'}
          size={24}
          color="#fff"
        />
      </View>
      <View style={styles.myStatusInfo}>
        <Text style={styles.myStatusLabel}>My Status</Text>
        <Text style={styles.myStatusHint}>
          {hasActiveStatus ? 'Tap to add update' : 'Tap to add status'}
        </Text>
      </View>
      {hasActiveStatus && (
        <TouchableOpacity onPress={() => deleteStatus(myStatuses[0].id)}>
          <Ionicons name="trash-outline" size={20} color="#ff4757" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )

  const renderUserStatus = ({ item }) => {
    const recentStatus = item.statuses[0]
    return (
      <TouchableOpacity
        style={styles.userStatusCard}
        onPress={() => viewStatus(recentStatus)}
      >
        <View style={[styles.statusAvatar, styles.activeStatusAvatar]}>
          <Text style={styles.statusAvatarText}>
            {item.user?.display_name?.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <View style={styles.userStatusInfo}>
          <Text style={styles.userStatusName}>{item.user?.display_name || 'Unknown'}</Text>
          <Text style={styles.userStatusTime}>
            {getTimeAgo(recentStatus.created_at)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#444" />
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#6c63ff" /></View>
      ) : (
        <FlatList
          ListHeaderComponent={renderMyStatus}
          data={statusList}
          keyExtractor={(item) => item.user?.id || Math.random().toString()}
          renderItem={renderUserStatus}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="cellular-outline" size={64} color="#333" />
              <Text style={styles.emptyTitle}>No updates yet</Text>
              <Text style={styles.emptyText}>
                Status updates appear here for 24 hours
              </Text>
            </View>
          }
          refreshing={loading}
          onRefresh={fetchStatuses}
        />
      )}

      {/* Create Status Modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Status</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.statusInput}
              placeholder="What's on your mind?"
              placeholderTextColor="#666"
              value={statusText}
              onChangeText={setStatusText}
              multiline
              maxLength={200}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.postButton, (!statusText.trim() || creating) && styles.disabled]}
              onPress={createStatus}
              disabled={!statusText.trim() || creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.postButtonText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* View Status Modal */}
      <Modal visible={!!viewingStatus} transparent animationType="fade">
        <TouchableOpacity
          style={styles.viewOverlay}
          activeOpacity={1}
          onPress={() => setViewingStatus(null)}
        >
          <View style={styles.viewContent}>
            <Text style={styles.viewStatusText}>{viewingStatus?.content}</Text>
            <Text style={styles.viewStatusTime}>
              {viewingStatus && getTimeAgo(viewingStatus.created_at)}
            </Text>
            {viewerNames ? (
              <Text style={styles.viewerNames}>Seen by: {viewerNames}</Text>
            ) : (
              <Text style={styles.viewerNames}>No views yet</Text>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 8 },
  myStatusCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#16213e', marginHorizontal: 12, marginBottom: 12,
    borderRadius: 14, gap: 14,
  },
  myStatusInfo: { flex: 1 },
  myStatusLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  myStatusHint: { color: '#888', fontSize: 13, marginTop: 2 },
  statusAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#2a2a4a', justifyContent: 'center', alignItems: 'center',
  },
  activeStatusAvatar: {
    borderWidth: 3, borderColor: '#2ecc71',
  },
  statusAvatarText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  userStatusCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a', gap: 14,
  },
  userStatusInfo: { flex: 1 },
  userStatusName: { color: '#fff', fontSize: 16, fontWeight: '500' },
  userStatusTime: { color: '#888', fontSize: 13, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptyText: { color: '#888', fontSize: 15, textAlign: 'center', marginTop: 8 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#16213e', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  statusInput: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16, fontSize: 16,
    color: '#fff', minHeight: 100, textAlignVertical: 'top',
    borderWidth: 1, borderColor: '#2a2a4a', marginBottom: 16,
  },
  postButton: {
    backgroundColor: '#6c63ff', borderRadius: 12, padding: 14, alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  postButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  viewOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  viewContent: {
    backgroundColor: '#16213e', borderRadius: 20, padding: 32, alignItems: 'center',
  },
  viewStatusText: { color: '#fff', fontSize: 22, lineHeight: 30, textAlign: 'center', marginBottom: 16 },
  viewStatusTime: { color: '#666', fontSize: 13, marginBottom: 16 },
  viewerNames: { color: '#888', fontSize: 13, textAlign: 'center' },
})
