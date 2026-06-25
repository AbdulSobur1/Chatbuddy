import React, { useState, useCallback, useEffect } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'
import { colors, radius } from '../lib/theme'
import Avatar from '../components/Avatar'
import { ListItemSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'

export default function GroupsListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastMessages, setLastMessages] = useState({})
  const toast = useToast()

  useFocusEffect(useCallback(() => { fetchGroups() }, [user]))

  const fetchGroups = async () => {
    if (!user) return; setLoading(true)
    const { data } = await supabase
      .from('channel_members').select('channel_id, channels!inner(*)').eq('user_id', user.id)
    const groupChannels = (data || []).map((cm) => cm.channels).filter((c) => c && c.channel_type === 'group')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    setGroups(groupChannels); setLoading(false)
  }

  useEffect(() => {
    if (!groups.length) return
    supabase.from('messages').select('channel_id, content, created_at, sender:sender_id(display_name)')
      .in('channel_id', groups.map((c) => c.id)).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => {
        if (data) { const seen = new Set(); const map = {}; for (const m of data) { if (!seen.has(m.channel_id)) { seen.add(m.channel_id); map[m.channel_id] = m } } setLastMessages(map) }
      })
  }, [groups])

  const renderGroup = ({ item }) => {
    const msg = lastMessages[item.id]
    const preview = msg ? `${msg.sender?.display_name || 'Someone'}: ${(msg.content || 'Sent a file').substring(0, 40)}` : 'No messages yet'
    return (
      <TouchableOpacity style={styles.groupItem} onPress={() => navigation.navigate('Chat', { channel: item })} activeOpacity={0.7}>
        <Avatar name={item.name} size="lg" />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.preview} numberOfLines={1}>{preview}</Text>
        </View>
        <View style={styles.meta}>
          {msg && <Text style={styles.time}>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>}
          <TouchableOpacity onPress={() => navigation.navigate('GroupInfo', { channel: item })}>
            <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('CreateGroup')}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.actionBtnText}>Create Group</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Invite')}>
          <Ionicons name="key-outline" size={20} color={colors.primary} />
          <Text style={styles.actionBtnText}>Join Code</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.skel}>{Array.from({ length: 5 }).map((_, i) => <ListItemSkeleton key={i} />)}</View>
      ) : (
        <FlatList data={groups} keyExtractor={(item) => item.id} renderItem={renderGroup}
          contentContainerStyle={!groups.length && styles.center}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="people-outline" size={64} color={colors.textDisabled} /><Text style={styles.emptyTitle}>No groups yet</Text><Text style={styles.emptyText}>Create a group or join one with an invite code</Text></View>}
          refreshing={loading} onRefresh={fetchGroups}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  skel: { paddingTop: 8 },
  btnRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${colors.primary}15`, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  actionBtnText: { color: colors.primary, fontSize: 14, fontWeight: '500' },
  groupItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  info: { flex: 1, marginLeft: 12 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  preview: { color: colors.textTertiary, fontSize: 14 },
  meta: { alignItems: 'flex-end', marginLeft: 8, gap: 4 },
  time: { color: colors.textMuted, fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptyText: { color: colors.textTertiary, fontSize: 15, marginTop: 8, textAlign: 'center' },
})
