import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, FlatList } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'
import { colors, radius } from '../lib/theme'
import Button from '../components/Button'
import { useToast } from '../components/Toast'

export default function CreateGroupScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const [name, setName] = useState('')
  const [step, setStep] = useState('create')
  const [users, setUsers] = useState([])
  const [selectedUsers, setSelectedUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [groupId, setGroupId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const toast = useToast()

  const handleCreate = async () => {
    if (!name.trim()) { toast.show('Group name is required', 'error'); return }
    setLoading(true)
    try {
      const { data: channel } = await supabase.from('channels').insert({ name: name.trim(), created_by: user.id, channel_type: 'group', is_group: true }).select().single()
      await supabase.from('channel_members').insert({ channel_id: channel.id, user_id: user.id, role: 'owner' })
      setGroupId(channel.id); setInviteCode(channel.invite_code); setUsers([]); setStep('add-members')
    } catch (e) { toast.show(e.message, 'error') } finally { setLoading(false) }
  }

  const toggleUser = (id) => setSelectedUsers((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])

  const addMembers = async () => {
    if (!selectedUsers.length) { setStep('done'); return }
    setLoading(true)
    try { for (const uid of selectedUsers) await supabase.from('channel_members').insert({ channel_id: groupId, user_id: uid, role: 'member' }); setStep('done') }
    catch (e) { toast.show(e.message, 'error') } finally { setLoading(false) }
  }

  const handleSearch = async (text) => {
    setSearchQuery(text)
    if (text.length < 2) { setUsers([]); return }
    const { data } = await supabase.from('users').select('id, display_name, username').neq('id', user.id).ilike('username', `%${text.toLowerCase()}%`).limit(20)
    setUsers(data || [])
  }

  if (step === 'done') return (
    <View style={styles.container}><View style={styles.doneCont}>
      <Ionicons name="checkmark-circle" size={80} color={colors.accent} />
      <Text style={styles.doneTitle}>Group Created!</Text>
      <View style={styles.inviteCard}><Text style={styles.inviteLabel}>Invite Code</Text><Text style={styles.inviteCode}>{inviteCode}</Text><Text style={styles.inviteHint}>Share this code with friends to join</Text></View>
      <Button title="Go to Group" onPress={() => navigation.navigate('Chat', { channel: { id: groupId, name, channel_type: 'group', is_group: true } })} size="lg" fullWidth />
      <TouchableOpacity style={{ marginTop: 12 }} onPress={() => navigation.goBack()}><Text style={{ color: colors.textMuted, fontSize: 15 }}>Back to Groups</Text></TouchableOpacity>
    </View></View>
  )

  if (step === 'add-members') return (
    <View style={styles.container}>
      <View style={{ padding: 20, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600' }}>Add Members (optional)</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 4 }}>Search by @username to add people</Text>
      </View>
      <View style={styles.searchCont}><Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} /><TextInput style={styles.searchInput} placeholder="Search by @username..." placeholderTextColor={colors.textMuted} value={searchQuery} onChangeText={handleSearch} autoCapitalize="none" /></View>
      <FlatList data={users} keyExtractor={(item) => item.id} renderItem={({ item }) => { const sel = selectedUsers.includes(item.id); return (<TouchableOpacity style={[styles.userItem, sel && { backgroundColor: `${colors.primary}15` }]} onPress={() => toggleUser(item.id)}><View style={[styles.av, sel && { backgroundColor: colors.primary }]}><Text style={styles.avText}>{item.display_name?.charAt(0).toUpperCase() || '?'}</Text></View><Text style={{ flex: 1, color: colors.textPrimary, fontSize: 15 }}>{item.display_name}</Text><View style={[styles.check, sel && { backgroundColor: colors.primary, borderColor: colors.primary }]}>{sel && <Ionicons name="checkmark" size={16} color="#fff" />}</View></TouchableOpacity>) }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 40 }}>{searchQuery.length >= 2 ? 'No users found' : 'Search by @username'}</Text>} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderTopWidth: 0.5, borderTopColor: colors.border }}>
        <TouchableOpacity onPress={() => setStep('done')}><Text style={{ color: colors.textMuted, fontSize: 15 }}>Skip</Text></TouchableOpacity>
        <Button title={selectedUsers.length ? `Add ${selectedUsers.length}` : 'Skip & Continue'} onPress={addMembers} loading={loading} disabled={loading} />
      </View>
    </View>
  )

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ padding: 24 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: `${colors.primary}15`, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 16 }}><Ionicons name="people" size={48} color={colors.primary} /></View>
        <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: '700', textAlign: 'center' }}>Create a Group</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 32, marginTop: 8 }}>Create the group first, then add members</Text>
        <Text style={{ color: colors.textTertiary, fontSize: 14, marginBottom: 8, fontWeight: '500' }}>Group Name</Text>
        <TextInput style={styles.input} placeholder="e.g. Study Buddies" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} maxLength={50} autoFocus />
        <Button title="Create Group" onPress={handleCreate} loading={loading} disabled={loading} size="lg" fullWidth style={{ marginTop: 20 }} />
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  doneCont: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  doneTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: '700', marginTop: 16, marginBottom: 32 },
  inviteCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginBottom: 24 },
  inviteLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 8 },
  inviteCode: { color: colors.primary, fontSize: 32, fontWeight: '700', letterSpacing: 8, marginBottom: 12 },
  inviteHint: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  searchCont: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: radius.md, marginHorizontal: 12, marginVertical: 8, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, padding: 0 },
  userItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  av: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceHover, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.textDisabled, justifyContent: 'center', alignItems: 'center' },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
})
