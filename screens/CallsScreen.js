import React, { useState, useCallback, useMemo } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'
import { useColors, radius } from '../lib/theme'
import Avatar from '../components/Avatar'
import { ListItemSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'

export default function CallsScreen() {
  const colors = useColors()
  const user = useAuthStore((s) => s.user)
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewCall, setShowNewCall] = useState(false)
  const [users, setUsers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [callType, setCallType] = useState('audio')
  const [initiating, setInitiating] = useState(false)
  const toast = useToast()

  useFocusEffect(useCallback(() => { fetchCalls() }, [user]))

  const fetchCalls = async () => {
    if (!user) return; setLoading(true)
    const { data } = await supabase
      .from('calls').select('*, caller:caller_id(id, display_name), receiver:receiver_id(id, display_name)')
      .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`).order('started_at', { ascending: false }).limit(50)
    setCalls(data || []); setLoading(false)
  }

  const initiateCall = async (otherUserId, type) => {
    if (!otherUserId) return; setInitiating(true)
    try {
      const { data: mems } = await supabase.from('channel_members').select('channel_id, channels!inner(channel_type)').eq('user_id', user.id)
      let channelId = null
      const dmIds = (mems || []).filter((m) => m.channels?.channel_type === 'dm').map((m) => m.channel_id)
      if (dmIds.length) {
        const { data: shared } = await supabase.from('channel_members').select('channel_id').in('channel_id', dmIds).eq('user_id', otherUserId).maybeSingle()
        if (shared) channelId = shared.channel_id
      }
      await supabase.from('calls').insert({ channel_id: channelId, caller_id: user.id, receiver_id: otherUserId, call_type: type, status: 'outgoing' })
      setShowNewCall(false); toast.show(`${type === 'audio' ? 'Audio' : 'Video'} call initiated!`, 'success'); fetchCalls()
    } catch { toast.show('Call failed', 'error') } finally { setInitiating(false) }
  }

  const getInfo = (call) => {
    const outgoing = call.caller_id === user.id
    const other = outgoing ? call.receiver : call.caller
    const icon = outgoing ? 'arrow-up' : 'arrow-down'
    const iconColor = call.status === 'answered' ? colors.accent : call.status === 'missed' ? colors.danger : colors.primary
    let label = outgoing ? 'Outgoing' : 'Incoming'
    if (call.status === 'missed') label = outgoing ? 'Cancelled' : 'Missed'
    if (call.status === 'answered' && call.duration > 0) {
      const m = Math.floor(call.duration / 60); const s = call.duration % 60
      label += ` · ${m}:${s.toString().padStart(2, '0')}`
    }
    return { name: other?.display_name || 'Unknown', icon, iconColor, label, other, type: call.call_type }
  }

  const formatDate = (d) => { const date = new Date(d); const now = new Date(); if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); const y = new Date(now); y.setDate(y.getDate() - 1); if (date.toDateString() === y.toDateString()) return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) }

  const renderCall = ({ item }) => {
    const { name, icon, iconColor, label, type } = getInfo(item)
    return (<TouchableOpacity style={styles.item}><View style={styles.av}><Text style={styles.avText}>{name.charAt(0).toUpperCase()}</Text></View><View style={styles.info}><View style={styles.row}><Ionicons name={icon} size={14} color={iconColor} /><Text style={styles.name}>{name}</Text></View><Text style={styles.label}>{label}</Text></View><View style={styles.meta}><Text style={styles.time}>{formatDate(item.started_at)}</Text><Ionicons name={type === 'video' ? 'videocam-outline' : 'call-outline'} size={20} color={colors.primary} /></View></TouchableOpacity>)
  }

  const styles = useMemo(() => makeStyles(colors), [colors])

  return (
    <View style={styles.container}>
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => { setCallType('audio'); setSearchQuery(''); setUsers([]); setShowNewCall(true) }}>
          <Ionicons name="call-outline" size={20} color={colors.accent} /><Text style={[styles.actionBtnText, { color: colors.accent }]}>Audio Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => { setCallType('video'); setSearchQuery(''); setUsers([]); setShowNewCall(true) }}>
          <Ionicons name="videocam-outline" size={20} color={colors.primary} /><Text style={[styles.actionBtnText, { color: colors.primary }]}>Video Call</Text>
        </TouchableOpacity>
      </View>
      {loading ? <View style={styles.skel}>{Array.from({ length: 5 }).map((_, i) => <ListItemSkeleton key={i} />)}</View> :
        <FlatList data={calls} keyExtractor={(item) => item.id} renderItem={renderCall} contentContainerStyle={!calls.length && styles.center}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="call-outline" size={64} color={colors.textDisabled} /><Text style={styles.emptyTitle}>No calls yet</Text><Text style={styles.emptyText}>Tap above to start a call</Text></View>}
          refreshing={loading} onRefresh={fetchCalls} />}
      <Modal visible={showNewCall} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{callType === 'audio' ? 'Audio' : 'Video'} Call</Text><TouchableOpacity onPress={() => setShowNewCall(false)}><Ionicons name="close" size={24} color={colors.textMuted} /></TouchableOpacity></View>
          <View style={styles.searchCont}><Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} /><TextInput style={styles.searchInput} placeholder="Search by @username..." placeholderTextColor={colors.textMuted} value={searchQuery} onChangeText={(v) => { setSearchQuery(v); if (v.length < 2) { setUsers([]); return } supabase.from('users').select('id, display_name, username').neq('id', user.id).ilike('username', `%${v.toLowerCase()}%`).limit(20).then(({ data }) => setUsers(data || [])) }} autoCapitalize="none" /></View>
          <FlatList data={users} keyExtractor={(item) => item.id} renderItem={({ item }) => (<TouchableOpacity style={styles.userItem} onPress={() => initiateCall(item.id, callType)} disabled={initiating}><Avatar name={item.display_name} size="md" /><View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.userName}>{item.display_name}</Text><Text style={styles.userHandle}>@{item.username}</Text></View><Ionicons name={callType === 'audio' ? 'call-outline' : 'videocam-outline'} size={20} color={colors.primary} /></TouchableOpacity>)}
            ListEmptyComponent={<View style={styles.noUsers}><Text style={styles.noUsersText}>{searchQuery ? 'No users found' : 'Search by @username'}</Text></View>} />
        </View></View>
      </Modal>
    </View>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg }, center: { flex: 1, justifyContent: 'center', alignItems: 'center' }, skel: { paddingTop: 8 },
  btnRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border },
  actionBtnText: { fontSize: 14, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  av: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceHover, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  info: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '500' },
  label: { color: colors.textTertiary, fontSize: 13, marginLeft: 20 },
  meta: { alignItems: 'flex-end', gap: 4 },
  time: { color: colors.textMuted, fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 80 }, emptyTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '600', marginTop: 16 }, emptyText: { color: colors.textTertiary, fontSize: 15, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '85%', paddingTop: 20, paddingBottom: 34 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  modalTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  searchCont: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: radius.md, marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, padding: 0 },
  userItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  userName: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' }, userHandle: { color: colors.primary, fontSize: 13, marginTop: 2 },
  noUsers: { alignItems: 'center', paddingVertical: 40 }, noUsersText: { color: colors.textMuted, fontSize: 15 },
})
