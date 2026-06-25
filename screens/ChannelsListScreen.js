import React, { useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Modal } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'
import { colors, radius } from '../lib/theme'
import { ListItemSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'

export default function ChannelsListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [followedIds, setFollowedIds] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [showInviteInput, setShowInviteInput] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)
  const toast = useToast()

  useFocusEffect(useCallback(() => { fetchChannels(); fetchFollowed() }, [user]))

  const fetchChannels = async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('channels')
      .select('*, followers:channel_followers(count)')
      .eq('channel_type', 'broadcast')
      .order('created_at', { ascending: false })
    setChannels(data || [])
    setLoading(false)
  }

  const fetchFollowed = async () => {
    if (!user) return
    const { data } = await supabase.from('channel_followers').select('channel_id').eq('user_id', user.id)
    if (data) setFollowedIds(new Set(data.map((f) => f.channel_id)))
  }

  const toggleFollow = async (channelId) => {
    if (followedIds.has(channelId)) {
      await supabase.from('channel_followers').delete().eq('channel_id', channelId).eq('user_id', user.id)
      setFollowedIds((prev) => { const n = new Set(prev); n.delete(channelId); return n })
      toast.show('Unfollowed channel', 'info')
    } else {
      await supabase.from('channel_followers').insert({ channel_id: channelId, user_id: user.id })
      setFollowedIds((prev) => new Set(prev).add(channelId))
      toast.show('Following channel!', 'success')
    }
  }

  const joinByInvite = async () => {
    if (!inviteCode.trim()) return
    setJoining(true)
    try {
      const { data, error } = await supabase.from('channels').select('*').eq('invite_code', inviteCode.trim().toUpperCase()).single()
      if (error || !data) { toast.show('No channel found with that code', 'error'); return }
      if (data.channel_type === 'broadcast') {
        await supabase.from('channel_followers').insert({ channel_id: data.id, user_id: user.id })
        toast.show(`Joined "${data.name}"!`, 'success')
      } else { toast.show('This code is for a group, not a channel', 'warning') }
      setShowInviteInput(false); setInviteCode(''); fetchChannels(); fetchFollowed()
    } catch { toast.show('Failed to join', 'error') } finally { setJoining(false) }
  }

  const filtered = channels.filter((c) => c.name?.toLowerCase().includes(searchQuery.toLowerCase()))

  const renderChannel = ({ item }) => {
    const isFollowed = followedIds.has(item.id)
    const count = item.followers?.[0]?.count || 0
    return (
      <TouchableOpacity style={styles.channelItem} onPress={() => isFollowed ? navigation.navigate('ChannelView', { channel: item }) : toast.show('Follow this channel first', 'info')} activeOpacity={0.7}>
        <View style={styles.avatar}><Ionicons name="megaphone" size={24} color="#fff" /></View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          {item.description && <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>}
          <Text style={styles.count}>{count} {count === 1 ? 'follower' : 'followers'}</Text>
        </View>
        <TouchableOpacity style={[styles.followBtn, isFollowed && styles.followingBtn]} onPress={() => toggleFollow(item.id)}>
          <Text style={[styles.followText, isFollowed && styles.followingText]}>{isFollowed ? 'Following' : 'Follow'}</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.actionRow}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Search channels..." placeholderTextColor={colors.textMuted} value={searchQuery} onChangeText={setSearchQuery} />
        </View>
      </View>
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('CreateChannel')}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.actionBtnText}>Create</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowInviteInput(true)}>
          <Ionicons name="key-outline" size={20} color={colors.primary} />
          <Text style={styles.actionBtnText}>Join Code</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.skel}>{Array.from({ length: 5 }).map((_, i) => <ListItemSkeleton key={i} />)}</View>
      ) : (
        <FlatList data={filtered} keyExtractor={(item) => item.id} renderItem={renderChannel}
          contentContainerStyle={!filtered.length && styles.center}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="megaphone-outline" size={64} color={colors.textDisabled} /><Text style={styles.emptyTitle}>No channels yet</Text><Text style={styles.emptyText}>Create one or follow existing channels</Text></View>}
          refreshing={loading} onRefresh={() => { fetchChannels(); fetchFollowed() }}
        />
      )}

      <Modal visible={showInviteInput} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Join Channel</Text>
            <Text style={styles.modalSubtitle}>Enter the invite code</Text>
            <TextInput style={styles.modalInput} placeholder="ABC12345" placeholderTextColor={colors.textMuted} value={inviteCode} onChangeText={(t) => setInviteCode(t.toUpperCase())} autoCapitalize="characters" maxLength={8} autoFocus />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowInviteInput(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.joinBtn, joining && { opacity: 0.5 }]} onPress={joinByInvite} disabled={joining}>
                {joining ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.joinText}>Join</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  skel: { paddingTop: 8 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 12, height: 40, gap: 8, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, padding: 0 },
  actionRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  btnRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${colors.primary}15`, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  actionBtnText: { color: colors.primary, fontSize: 14, fontWeight: '500' },
  channelItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e67e22', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  info: { flex: 1 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 2 },
  desc: { color: colors.textTertiary, fontSize: 13, marginBottom: 2 },
  count: { color: colors.textMuted, fontSize: 12 },
  followBtn: { borderRadius: 8, borderWidth: 1, borderColor: colors.primary, paddingVertical: 6, paddingHorizontal: 14 },
  followingBtn: { backgroundColor: colors.primary },
  followText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  followingText: { color: '#fff' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptyText: { color: colors.textTertiary, fontSize: 15, marginTop: 8, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', paddingHorizontal: 24 },
  modalContent: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24 },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '600', marginBottom: 8 },
  modalSubtitle: { color: colors.textMuted, fontSize: 14, marginBottom: 20 },
  modalInput: { backgroundColor: colors.bg, borderRadius: radius.md, padding: 14, fontSize: 18, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, marginBottom: 20, textAlign: 'center', letterSpacing: 4 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: colors.surfaceHover },
  cancelText: { color: colors.textTertiary, fontSize: 15 },
  joinBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: colors.primary },
  joinText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})
