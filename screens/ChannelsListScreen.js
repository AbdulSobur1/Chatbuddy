import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert, Modal,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'

export default function ChannelsListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [followedIds, setFollowedIds] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showInviteInput, setShowInviteInput] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)

  useFocusEffect(
    useCallback(() => { fetchChannels(); fetchFollowed() }, [user])
  )

  const fetchChannels = async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('channels')
      .select('*, followers:channel_followers(count)')
      .eq('channel_type', 'broadcast')
      .order('created_at', { ascending: false })

    if (error) console.error('fetchChannels error:', error)
    else setChannels(data || [])
    setLoading(false)
  }

  const fetchFollowed = async () => {
    if (!user) return
    const { data } = await supabase
      .from('channel_followers')
      .select('channel_id')
      .eq('user_id', user.id)

    if (data) setFollowedIds(new Set(data.map((f) => f.channel_id)))
  }

  const toggleFollow = async (channelId) => {
    if (followedIds.has(channelId)) {
      await supabase.from('channel_followers').delete()
        .eq('channel_id', channelId)
        .eq('user_id', user.id)
      setFollowedIds((prev) => { const n = new Set(prev); n.delete(channelId); return n })
    } else {
      await supabase.from('channel_followers').insert({ channel_id: channelId, user_id: user.id })
      setFollowedIds((prev) => new Set(prev).add(channelId))
    }
  }

  const joinByInvite = async () => {
    if (!inviteCode.trim()) return
    setJoining(true)
    try {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('invite_code', inviteCode.trim().toUpperCase())
        .single()

      if (error || !data) {
        Alert.alert('Invalid Code', 'No channel found with that invite code')
        return
      }

      if (data.channel_type === 'broadcast') {
        await supabase.from('channel_followers').insert({
          channel_id: data.id, user_id: user.id,
        })
        Alert.alert('Joined!', `You are now following "${data.name}"`)
      } else {
        Alert.alert('Not a Channel', 'This invite is for a group, not a channel. Try the Groups tab.')
      }
      setShowInviteInput(false)
      setInviteCode('')
      fetchChannels()
      fetchFollowed()
    } catch (e) {
      Alert.alert('Error', e.message)
    } finally {
      setJoining(false)
    }
  }

  const filteredChannels = channels.filter((c) =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const renderChannel = ({ item }) => {
    const isFollowed = followedIds.has(item.id)
    const followerCount = item.followers?.[0]?.count || 0

    return (
      <TouchableOpacity
        style={styles.channelItem}
        onPress={() => {
          if (isFollowed) {
            navigation.navigate('ChannelView', { channel: item })
          } else {
            Alert.alert('Follow First', 'Follow this channel to view its posts')
          }
        }}
      >
        <View style={styles.channelAvatar}>
          <Ionicons name="megaphone" size={24} color="#fff" />
        </View>
        <View style={styles.channelInfo}>
          <Text style={styles.channelName}>{item.name}</Text>
          {item.description && (
            <Text style={styles.channelDesc} numberOfLines={1}>{item.description}</Text>
          )}
          <Text style={styles.followerCount}>
            {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.followBtn, isFollowed && styles.followingBtn]}
          onPress={() => toggleFollow(item.id)}
        >
          <Text style={[styles.followBtnText, isFollowed && styles.followingBtnText]}>
            {isFollowed ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      {/* Search & Actions */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#666" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search channels..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('CreateChannel')}>
          <Ionicons name="add-circle-outline" size={20} color="#6c63ff" />
          <Text style={styles.actionBtnText}>Create</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowInviteInput(true)}>
          <Ionicons name="key-outline" size={20} color="#6c63ff" />
          <Text style={styles.actionBtnText}>Join Code</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#6c63ff" /></View>
      ) : (
        <FlatList
          data={filteredChannels}
          keyExtractor={(item) => item.id}
          renderItem={renderChannel}
          contentContainerStyle={filteredChannels.length === 0 && styles.center}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="megaphone-outline" size={64} color="#333" />
              <Text style={styles.emptyTitle}>No channels yet</Text>
              <Text style={styles.emptyText}>Create one or follow existing channels</Text>
            </View>
          }
          refreshing={loading}
          onRefresh={() => { fetchChannels(); fetchFollowed() }}
        />
      )}

      {/* Join by Invite Modal */}
      <Modal visible={showInviteInput} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Join Channel</Text>
            <Text style={styles.modalSubtitle}>Enter the invite code shared by the channel admin</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. ABC12345"
              placeholderTextColor="#666"
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={8}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowInviteInput(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.joinBtn, joining && { opacity: 0.5 }]}
                onPress={joinByInvite}
                disabled={joining}
              >
                {joining ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.joinBtnText}>Join</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#16213e',
    borderRadius: 12, paddingHorizontal: 12, height: 40,
    borderWidth: 1, borderColor: '#2a2a4a',
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 15, padding: 0 },
  actionRow: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 12,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(108,99,255,0.1)', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  actionBtnText: { color: '#6c63ff', fontSize: 14, fontWeight: '500' },
  channelItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a',
  },
  channelAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#e67e22',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  channelInfo: { flex: 1 },
  channelName: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 2 },
  channelDesc: { color: '#888', fontSize: 13, marginBottom: 2 },
  followerCount: { color: '#666', fontSize: 12 },
  followBtn: {
    borderRadius: 8, borderWidth: 1, borderColor: '#6c63ff',
    paddingVertical: 6, paddingHorizontal: 14,
  },
  followingBtn: { backgroundColor: '#6c63ff', borderColor: '#6c63ff' },
  followBtnText: { color: '#6c63ff', fontSize: 13, fontWeight: '600' },
  followingBtnText: { color: '#fff' },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptyText: { color: '#888', fontSize: 15, marginTop: 8, textAlign: 'center' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: '#16213e', borderRadius: 16, padding: 24,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  modalSubtitle: { color: '#888', fontSize: 14, marginBottom: 20 },
  modalInput: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 14, fontSize: 18,
    color: '#fff', borderWidth: 1, borderColor: '#2a2a4a', marginBottom: 20,
    textAlign: 'center', letterSpacing: 4,
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: {
    paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#2a2a4a',
  },
  cancelBtnText: { color: '#888', fontSize: 15 },
  joinBtn: {
    paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#6c63ff',
  },
  joinBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})
