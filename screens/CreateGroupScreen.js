import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, FlatList, Modal,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'

export default function CreateGroupScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const [name, setName] = useState('')
  const [step, setStep] = useState('create') // create, add-members, done
  const [users, setUsers] = useState([])
  const [selectedUsers, setSelectedUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [groupId, setGroupId] = useState(null)
  const [searchEmail, setSearchEmail] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Group name is required')
      return
    }

    setLoading(true)
    try {
      const { data: channel, error } = await supabase
        .from('channels')
        .insert({
          name: name.trim(),
          created_by: user.id,
          channel_type: 'group',
          is_group: true,
        })
        .select()
        .single()

      if (error) throw error

      // Add creator as owner
      await supabase.from('channel_members').insert({
        channel_id: channel.id,
        user_id: user.id,
        role: 'owner',
      })

      setGroupId(channel.id)
      setInviteCode(channel.invite_code)

      // Don't fetch all users — user will search by username
      setUsers([])
      setStep('add-members')
    } catch (error) {
      Alert.alert('Error', error.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleUser = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  const addMembers = async () => {
    if (selectedUsers.length === 0) {
      setStep('done')
      return
    }

    setLoading(true)
    try {
      const members = selectedUsers.map((uid) => ({
        channel_id: groupId,
        user_id: uid,
        role: 'member',
      }))

      // Insert members one by one for RLS compliance
      for (const member of members) {
        await supabase.from('channel_members').insert(member)
      }

      setStep('done')
    } catch (error) {
      Alert.alert('Error', error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async (text) => {
    setSearchEmail(text)
    if (text.length < 2) {
      setUsers([])
      return
    }
    try {
      const { data } = await supabase
        .from('users')
        .select('id, display_name, username')
        .neq('id', user.id)
        .ilike('username', `%${text.toLowerCase()}%`)
        .limit(20)
      setUsers(data || [])
    } catch (error) {
      console.error('searchUsers error:', error)
    }
  }

  const skipMembers = () => setStep('done')

  if (step === 'done') {
    return (
      <View style={styles.container}>
        <View style={styles.doneContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color="#2ecc71" />
          </View>
          <Text style={styles.doneTitle}>Group Created!</Text>
          <Text style={styles.doneSubtitle}>{name}</Text>

          <View style={styles.inviteCard}>
            <Text style={styles.inviteLabel}>Invite Code</Text>
            <Text style={styles.inviteCode}>{inviteCode}</Text>
            <Text style={styles.inviteHint}>
              Share this code with friends to join. They can enter it in the Groups tab.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.goToGroupBtn}
            onPress={() => navigation.navigate('Chat', { channel: { id: groupId, name, channel_type: 'group', is_group: true } })}
          >
            <Text style={styles.goToGroupBtnText}>Go to Group</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Back to Groups</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (step === 'add-members') {
    return (
      <View style={styles.container}>
        <View style={styles.stepHeader}>
          <Text style={styles.stepTitle}>Add Members (optional)</Text>
          <Text style={styles.stepSubtitle}>
            Search by @username to find people to add to "{name}"
          </Text>
        </View>

        {/* Search input */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#666" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by @username..."
            placeholderTextColor="#666"
            value={searchEmail}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchEmail.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchEmail(''); setUsers([]) }}>
              <Ionicons name="close-circle" size={18} color="#666" />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isSelected = selectedUsers.includes(item.id)
            return (
              <TouchableOpacity
                style={[styles.userItem, isSelected && styles.userItemSelected]}
                onPress={() => toggleUser(item.id)}
              >
                <View style={[styles.userAvatar, isSelected && styles.userAvatarSelected]}>
                  <Text style={styles.userAvatarText}>
                    {item.display_name?.charAt(0).toUpperCase() || '?'}
                  </Text>
                </View>
                <Text style={styles.userName}>{item.display_name}</Text>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={
            <Text style={styles.noUsersText}>
              {searchEmail.length > 0 && searchEmail.length < 2 ? 'Type at least 2 characters...' : searchEmail ? 'No users found with that username' : 'Search by @username to find people'}
            </Text>
          }
        />

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.skipBtn} onPress={skipMembers}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, loading && { opacity: 0.5 }]}
            onPress={addMembers}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.addBtnText}>
                {selectedUsers.length > 0 ? `Add ${selectedUsers.length} Member${selectedUsers.length > 1 ? 's' : ''}` : 'Skip & Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // step === 'create'
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="people" size={48} color="#6c63ff" />
        </View>
        <Text style={styles.title}>Create a Group</Text>
        <Text style={styles.subtitle}>
          Create the group first, then add members or share the invite code
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Group Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Study Buddies"
            placeholderTextColor="#666"
            value={name}
            onChangeText={setName}
            maxLength={50}
            autoFocus
          />
        </View>

        <TouchableOpacity
          style={[styles.createButton, loading && styles.disabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>Create Group</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  iconContainer: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(108,99,255,0.1)',
    justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 16,
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 32, marginTop: 8 },
  inputGroup: { marginBottom: 20 },
  label: { color: '#aaa', fontSize: 14, marginBottom: 8, fontWeight: '500' },
  input: {
    backgroundColor: '#16213e', borderRadius: 12, padding: 14, fontSize: 16,
    color: '#fff', borderWidth: 1, borderColor: '#2a2a4a',
  },
  createButton: {
    backgroundColor: '#6c63ff', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 12,
  },
  disabled: { opacity: 0.6 },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  stepHeader: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a' },
  stepTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  stepSubtitle: { color: '#888', fontSize: 14, marginTop: 4 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a2e',
    borderRadius: 10, marginHorizontal: 12, marginVertical: 8, paddingHorizontal: 12,
    height: 40, borderWidth: 1, borderColor: '#2a2a4a',
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 15, padding: 0 },
  userItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a',
  },
  userItemSelected: { backgroundColor: 'rgba(108,99,255,0.1)' },
  userAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#2a2a4a',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  userAvatarSelected: { backgroundColor: '#6c63ff' },
  userAvatarText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  userName: { color: '#fff', fontSize: 15, flex: 1 },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#444',
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxSelected: { backgroundColor: '#6c63ff', borderColor: '#6c63ff' },
  noUsersText: { color: '#888', textAlign: 'center', paddingVertical: 40 },
  bottomBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: '#2a2a4a',
  },
  skipBtn: { paddingVertical: 10, paddingHorizontal: 20 },
  skipBtnText: { color: '#888', fontSize: 15 },
  addBtn: {
    backgroundColor: '#6c63ff', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  doneContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  successIcon: { marginBottom: 16 },
  doneTitle: { color: '#fff', fontSize: 24, fontWeight: '700' },
  doneSubtitle: { color: '#aaa', fontSize: 16, marginTop: 4, marginBottom: 32 },
  inviteCard: {
    backgroundColor: '#16213e', borderRadius: 16, padding: 24, width: '100%',
    alignItems: 'center', borderWidth: 1, borderColor: '#2a2a4a', marginBottom: 24,
  },
  inviteLabel: { color: '#888', fontSize: 13, marginBottom: 8 },
  inviteCode: {
    color: '#6c63ff', fontSize: 32, fontWeight: '700', letterSpacing: 8, marginBottom: 12,
  },
  inviteHint: { color: '#666', fontSize: 13, textAlign: 'center' },
  goToGroupBtn: {
    backgroundColor: '#6c63ff', borderRadius: 12, padding: 16, width: '100%', alignItems: 'center', marginBottom: 12,
  },
  goToGroupBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  backBtn: { padding: 12 },
  backBtnText: { color: '#888', fontSize: 15 },
})
