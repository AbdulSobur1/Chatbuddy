import React, { useState, useEffect, useMemo } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Modal, ActivityIndicator, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { useColors, radius } from '../lib/theme'
import Avatar from '../components/Avatar'
import { useToast } from '../components/Toast'

export default function GroupInfoScreen({ route, navigation }) {
  const colors = useColors()
  const { channel } = route.params
  const user = useAuthStore((s) => s.user)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddMember, setShowAddMember] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const toast = useToast()

  const isOwner = members.some((m) => m.user_id === user.id && m.role === 'owner')
  useEffect(() => { fetchMembers() }, [])

  const fetchMembers = async () => {
    setLoading(true)
    const { data } = await supabase.from('channel_members')
      .select('user_id, role, joined_at, user:user_id(id, display_name, avatar_url)').eq('channel_id', channel.id)
    setMembers(data || []); setLoading(false)
  }

  const searchUsers = async (text) => {
    setSearchQuery(text)
    if (text.length < 2) { setSearchResults([]); return }
    setSearching(true)
    const { data } = await supabase.from('users').select('id, display_name, username').neq('id', user.id).ilike('username', `%${text.toLowerCase()}%`).limit(10)
    setSearchResults(data || []); setSearching(false)
  }

  const addMember = async (userId) => {
    const { error } = await supabase.from('channel_members').insert({ channel_id: channel.id, user_id: userId, role: 'member' })
    if (error) { toast.show(error.message, 'error'); return }
    fetchMembers(); setShowAddMember(false); setSearchQuery(''); setSearchResults([])
    toast.show('Member added!', 'success')
  }

  const removeMember = async (userId) => {
    Alert.alert('Remove Member', 'Are you sure you want to remove this member?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await supabase.from('channel_members').delete().eq('channel_id', channel.id).eq('user_id', userId)
          fetchMembers()
          toast.show('Member removed', 'info')
        },
      },
    ])
  }

  const renderMember = ({ item }) => (
    <View style={styles.memberItem}>
      <Avatar name={item.user?.display_name} size="md" />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>{item.user?.display_name || 'Unknown'}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{item.role === 'owner' ? '👑 Owner' : 'Member'}</Text>
      </View>
      {isOwner && item.user_id !== user.id && (
        <TouchableOpacity onPress={() => removeMember(item.user_id)}><Ionicons name="close-circle-outline" size={24} color={colors.danger} /></TouchableOpacity>
      )}
    </View>
  )

  const styles = useMemo(() => makeStyles(colors), [colors])

  if (loading) return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={colors.primary} /></View>

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Avatar name={channel.name} size="xl" />
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '600' }}>{channel.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 4 }}>{members.length} {members.length === 1 ? 'member' : 'members'}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}>Members</Text>
        {isOwner && <TouchableOpacity onPress={() => setShowAddMember(true)}><Ionicons name="person-add-outline" size={22} color={colors.primary} /></TouchableOpacity>}
      </View>
      <FlatList data={members} keyExtractor={(item) => item.user_id} renderItem={renderMember} contentContainerStyle={{ paddingHorizontal: 12 }} />

      <Modal visible={showAddMember} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24, maxHeight: '80%' }}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', marginBottom: 16 }}>Add Member</Text>
            <TextInput style={{ backgroundColor: colors.bg, borderRadius: radius.md, padding: 14, fontSize: 15, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}
              placeholder="Search by @username..." placeholderTextColor={colors.textMuted} value={searchQuery} onChangeText={searchUsers} autoFocus />
            {searching && <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />}
            <FlatList data={searchResults} keyExtractor={(item) => item.id}
              renderItem={({ item }) => (<TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 }} onPress={() => addMember(item.id)}>
                <Avatar name={item.display_name} size="sm" /><View style={{ flex: 1 }}><Text style={{ color: colors.textPrimary, fontSize: 15 }}>{item.display_name}</Text><Text style={{ color: colors.primary, fontSize: 13 }}>@{item.username}</Text></View>
                <Ionicons name="add-circle" size={24} color={colors.primary} /></TouchableOpacity>)}
              ListEmptyComponent={searchQuery.length > 1 && !searching ? <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 16 }}>No users found</Text> : null}
              style={{ maxHeight: 300 }} />
            <TouchableOpacity style={{ alignSelf: 'center', marginTop: 12, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: colors.surfaceHover, borderRadius: 10 }}
              onPress={() => { setShowAddMember(false); setSearchQuery(''); setSearchResults([]) }}>
              <Text style={{ color: colors.textMuted, fontSize: 15 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  memberItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border },
})
