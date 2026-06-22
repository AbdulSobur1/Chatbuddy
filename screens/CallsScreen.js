import React, { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'

export default function CallsScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)

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

  return (
    <View style={styles.container}>
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
                Your call history will appear here
              </Text>
            </View>
          }
          refreshing={loading}
          onRefresh={fetchCalls}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
})
