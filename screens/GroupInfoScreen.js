import React, { useState, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, TextInput, Modal, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../lib/store'
import { supabase } from '../lib/supabase'

export default function GroupInfoScreen({ route, navigation }) {
  const { channel } = route.params
  const user = useAuthStore((s) => s.user)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddMember, setShowAddMember] = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [newName, setNewName] = useState(channel.name || '')
  const [searchEmail, setSearchEmail] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  const isOwner = members.some((m) => m.user_id === user.id && m.role === 'owner')

  useEffect(() => {
    fetchMembers()
  }, [])

  const fetchMembers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('channel_members')
      .select('user_id, role, joined_at, user:user_id(id, display_name, avatar_url)')
      .eq('channel_id', channel.id)

    if (error) {
      console.error('fetchMembers error:', error)
    } else {
      setMembers(data || [])
    }
    setLoading(false)
  }

  const searchUsers = async (text) => {
    setSearchEmail(text)
    if (text.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    const { data } = await supabase
      .from('users')
      .select('id, display_name')
      .ilike('display_name', `%${text}%`)
      .limit(10)
    setSearchResults(data || [])
    setSearching(false)
  }

  const addMember = async (userId) => {
    const { error } = await supabase.from('channel_members').insert({
      channel_id: channel.id,
      user_id: userId,
      role: 'member',
    })
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    fetchMembers()
    setShowAddMember(false)
    setSearchEmail('')
    setSearchResults([])
  }

  const removeMember = async (userId) => {
    Alert.alert(
      'Remove Member',
      'Are you sure you want to remove this member?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('channel_members')
              .delete()
              .eq('channel_id', channel.id)
              .eq('user_id', userId)
            if (error) {
              Alert.alert('Error', error.message)
            } else {
              fetchMembers()
            }
          },
        },
      ]
    )
  }

  const renameChannel = async () => {
    if (!newName.trim() || newName === channel.name) return
    const { error } = await supabase
      .from('channels')
      .update({ name: newName.trim() })
      .eq('id', channel.id)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      channel.name = newName.trim()
      setShowRename(false)
    }
  }

  const renderMember = ({ item }) => (
    <View style={styles.memberItem}>
      <View style={styles.memberAvatar}>
        <Text style={styles.memberAvatarText}>
          {(item.user?.display_name || '?').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>
          {item.user?.display_name || 'Unknown'}
        </Text>
        <Text style={styles.memberRole}>
          {item.role === 'owner' ? '👑 Owner' : 'Member'}
        </Text>
      </View>
      {isOwner && item.user_id !== user.id && (
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => removeMember(item.user_id)}
        >
          <Ionicons name="close-circle-outline" size={24} color="#ff4757" />
        </TouchableOpacity>
      )}
    </View>
  )

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Group Info Header */}
      <View style={styles.groupHeader}>
        <View style={styles.groupAvatar}>
          <Text style={styles.groupAvatarText}>
            {(channel.name || 'G').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.groupNameContainer}>
          <Text style={styles.groupName}>{channel.name}</Text>
          <Text style={styles.groupMeta}>
            {members.length} {members.length === 1 ? 'member' : 'members'} •{' '}
            {channel.is_group ? 'Group' : 'Direct'}
          </Text>
        </View>
        {isOwner && (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setShowRename(true)}
          >
            <Ionicons name="create-outline" size={20} color="#6c63ff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Members Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Members</Text>
        {isOwner && (
          <TouchableOpacity onPress={() => setShowAddMember(true)}>
            <Ionicons name="person-add-outline" size={22} color="#6c63ff" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={members}
        keyExtractor={(item) => item.user_id}
        renderItem={renderMember}
        contentContainerStyle={styles.membersList}
      />

      {/* Rename Modal */}
      <Modal visible={showRename} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rename Channel</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              placeholder="New channel name"
              placeholderTextColor="#666"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setShowRename(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={renameChannel}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Member Modal */}
      <Modal visible={showAddMember} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Member</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Search by name..."
              placeholderTextColor="#666"
              value={searchEmail}
              onChangeText={searchUsers}
              autoFocus
            />
            {searching && <ActivityIndicator color="#6c63ff" style={{ marginVertical: 8 }} />}
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.searchResult}
                  onPress={() => addMember(item.id)}
                >
                  <View style={styles.searchResultAvatar}>
                    <Text style={styles.searchResultAvatarText}>
                      {item.display_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.searchResultName}>{item.display_name}</Text>
                  <Ionicons name="add-circle" size={24} color="#6c63ff" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                searchEmail.length > 1 && !searching ? (
                  <Text style={styles.noResults}>No users found</Text>
                ) : null
              }
              style={{ maxHeight: 300 }}
            />
            <TouchableOpacity
              style={[styles.modalBtn, styles.cancelBtn, { alignSelf: 'center', marginTop: 12 }]}
              onPress={() => setShowAddMember(false)}
            >
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2a4a',
  },
  groupAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#6c63ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupAvatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
  },
  groupNameContainer: {
    flex: 1,
    marginLeft: 16,
  },
  groupName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  groupMeta: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  editButton: {
    padding: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  membersList: {
    paddingHorizontal: 12,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2a4a',
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2a2a4a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  memberRole: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  removeButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a4a',
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  cancelBtn: {
    backgroundColor: '#2a2a4a',
  },
  cancelBtnText: {
    color: '#888',
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: '#6c63ff',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  searchResultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6c63ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultAvatarText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  searchResultName: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
  },
  noResults: {
    color: '#888',
    textAlign: 'center',
    paddingVertical: 16,
  },
})
