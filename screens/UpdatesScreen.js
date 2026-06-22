import React, { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, ScrollView,
  Dimensions, StatusBar, Image,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore, useMessagesStore } from '../lib/store'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const AVATAR_SIZE = 64
const RING_SIZE = AVATAR_SIZE + 8

export default function UpdatesScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const uploadFile = useMessagesStore((s) => s.uploadFile)
  const [myStatuses, setMyStatuses] = useState([])
  const [contactStatuses, setContactStatuses] = useState([])
  const [allContacts, setAllContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [creating, setCreating] = useState(false)

  // Image picker state
  const [selectedImage, setSelectedImage] = useState(null) // { uri, fileName }

  // Story viewer state
  const [viewingUser, setViewingUser] = useState(null)
  const [currentStatusIndex, setCurrentStatusIndex] = useState(0)
  const [viewerNames, setViewerNames] = useState('')
  const [viewedIds, setViewedIds] = useState(new Set())

  useFocusEffect(
    useCallback(() => { fetchStatuses() }, [user])
  )

  const fetchStatuses = async () => {
    if (!user) return
    setLoading(true)

    const { data: mine } = await supabase
      .from('status_updates')
      .select('*')
      .eq('user_id', user.id)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    setMyStatuses(mine || [])

    const { data: myChannels } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', user.id)

    let allStatuses = []
    let contacts = []

    if (myChannels && myChannels.length > 0) {
      const channelIds = myChannels.map((c) => c.channel_id)

      const { data: otherMembers } = await supabase
        .from('channel_members')
        .select('user_id')
        .in('channel_id', channelIds)
        .neq('user_id', user.id)

      if (otherMembers && otherMembers.length > 0) {
        const userIds = [...new Set(otherMembers.map((m) => m.user_id))]

        const { data: usersData } = await supabase
          .from('users')
          .select('id, display_name, username, last_seen')
          .in('id', userIds)

        contacts = usersData || []

        const { data: statusData } = await supabase
          .from('status_updates')
          .select('*, user:user_id(id, display_name)')
          .in('user_id', userIds)
          .gte('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })

        allStatuses = statusData || []
      }
    }

    if (allStatuses.length > 0) {
      const statusIds = allStatuses.map((s) => s.id)
      const { data: myViews } = await supabase
        .from('status_views')
        .select('status_id')
        .in('status_id', statusIds)
        .eq('viewer_id', user.id)

      const viewed = new Set((myViews || []).map((v) => v.status_id))
      setViewedIds(viewed)
    }

    setContactStatuses(allStatuses)
    setAllContacts(contacts)
    setLoading(false)
  }

  // ─── Image Picker ──────────────────────────────────────────
  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [9, 16],
    })
    if (result.canceled) return
    setSelectedImage({
      uri: result.assets[0].uri,
      fileName: `status-${Date.now()}.jpg`,
    })
  }

  const removeSelectedImage = () => {
    setSelectedImage(null)
  }

  // ─── Create Status (text + optional image) ────────────────
  const createStatus = async () => {
    if (!statusText.trim() && !selectedImage) return
    setCreating(true)
    try {
      let mediaUrl = null
      let mediaType = 'text'

      if (selectedImage) {
        mediaUrl = await uploadFile(selectedImage.uri, selectedImage.fileName)
        mediaType = 'image'
      }

      await supabase.from('status_updates').insert({
        user_id: user.id,
        content: statusText.trim() || (mediaType === 'image' ? '📷 Photo' : null),
        media_url: mediaUrl,
        media_type: mediaType,
      })

      setShowCreate(false)
      setStatusText('')
      setSelectedImage(null)
      fetchStatuses()
    } catch (e) {
      Alert.alert('Error', e.message)
    } finally {
      setCreating(false)
    }
  }

  const deleteStatus = async (statusId) => {
    Alert.alert('Delete Status', 'Remove this status update?', [
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

  const openStory = async (statusUser, statuses) => {
    setViewingUser({ user: statusUser, statuses })
    setCurrentStatusIndex(0)

    const firstStatus = statuses[0]
    if (firstStatus && !viewedIds.has(firstStatus.id)) {
      await supabase.from('status_views').upsert(
        { status_id: firstStatus.id, viewer_id: user.id },
        { onConflict: 'status_id, viewer_id' }
      )
      setViewedIds((prev) => new Set(prev).add(firstStatus.id))
    }

    await fetchViewerNames(firstStatus)
  }

  const fetchViewerNames = async (status) => {
    if (!status) return
    const { data: views } = await supabase
      .from('status_views')
      .select('viewer:viewer_id(display_name)')
      .eq('status_id', status.id)

    if (views && views.length > 0) {
      setViewerNames(views.map((v) => v.viewer?.display_name || 'Someone').join(', '))
    } else {
      setViewerNames('')
    }
  }

  const navigateStory = async (direction) => {
    if (!viewingUser) return
    const newIndex = currentStatusIndex + direction

    if (newIndex < 0 || newIndex >= viewingUser.statuses.length) {
      setViewingUser(null)
      return
    }

    setCurrentStatusIndex(newIndex)
    const status = viewingUser.statuses[newIndex]

    if (!viewedIds.has(status.id)) {
      await supabase.from('status_views').upsert(
        { status_id: status.id, viewer_id: user.id },
        { onConflict: 'status_id, viewer_id' }
      )
      setViewedIds((prev) => new Set(prev).add(status.id))
    }

    await fetchViewerNames(status)
  }

  const closeStory = () => {
    setViewingUser(null)
    fetchStatuses()
  }

  // ─── Data transformations ──────────────────────────────────
  const groupedStatuses = {}
  contactStatuses.forEach((s) => {
    const uid = s.user_id
    if (!groupedStatuses[uid]) {
      groupedStatuses[uid] = { user: s.user, statuses: [s] }
    } else {
      groupedStatuses[uid].statuses.push(s)
    }
  })

  const statusList = Object.values(groupedStatuses)

  const recentStatusList = statusList.filter((item) =>
    item.statuses.some((s) => !viewedIds.has(s.id))
  )
  const viewedStatusList = statusList.filter((item) =>
    item.statuses.every((s) => viewedIds.has(s.id))
  )

  const getTimeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  // ─── Avatar Circle ─────────────────────────────────────────
  const AvatarCircle = ({ item, isMyStatus, isActive, onPress }) => {
    const hasUnviewed = isMyStatus
      ? false
      : item.statuses.some((s) => !viewedIds.has(s.id))

    return (
      <TouchableOpacity style={styles.avatarCircleWrapper} onPress={onPress} activeOpacity={0.7}>
        <View style={[
          styles.avatarRing,
          isActive && styles.avatarRingActive,
          hasUnviewed && styles.avatarRingUnviewed,
        ]}>
          <View style={[styles.avatarCircle, isMyStatus && styles.myAvatarCircle]}>
            {isMyStatus ? (
              <Ionicons
                name={isActive ? 'checkmark-circle' : 'add'}
                size={30}
                color="#fff"
              />
            ) : (
              <Text style={styles.avatarText}>
                {item.user?.display_name?.charAt(0).toUpperCase() || '?'}
              </Text>
            )}
          </View>
        </View>
        <Text style={[styles.avatarLabel, hasUnviewed && styles.avatarLabelActive]} numberOfLines={1}>
          {isMyStatus ? 'My Status' : item.user?.display_name?.split(' ')[0] || 'Unknown'}
        </Text>
      </TouchableOpacity>
    )
  }

  // ─── Circles Row ───────────────────────────────────────────
  const renderCirclesRow = () => {
    const allStatusItems = statusList

    return (
      <View style={styles.circlesSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.circlesScroll}
        >
          <AvatarCircle
            isMyStatus
            isActive={myStatuses.length > 0}
            onPress={() => {
              if (myStatuses.length > 0) {
                openStory({ id: user.id, display_name: 'My Status' }, myStatuses)
              } else {
                setShowCreate(true)
              }
            }}
          />

          {allStatusItems.map((item) => (
            <AvatarCircle
              key={item.user?.id}
              item={item}
              isActive={true}
              onPress={() => openStory(item.user, item.statuses)}
            />
          ))}

          {allStatusItems.length === 0 && (
            <View style={styles.noCirclesHint}>
              <Text style={styles.noCirclesText}>
                Statuses from contacts appear here
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    )
  }

  // ─── Story Content Renderer ────────────────────────────────
  const renderStoryContent = (status) => {
    if (!status) return null

    const isImage = status.media_type === 'image' && status.media_url

    return (
      <TouchableOpacity
        style={styles.storyContentArea}
        activeOpacity={1}
        onPress={(e) => {
          const x = e.nativeEvent.locationX
          if (x < SCREEN_WIDTH / 3) {
            navigateStory(-1)
          } else if (x > (SCREEN_WIDTH * 2) / 3) {
            navigateStory(1)
          } else {
            closeStory()
          }
        }}
      >
        {isImage ? (
          <View style={styles.storyImageContainer}>
            <Image
              source={{ uri: status.media_url }}
              style={styles.storyImage}
              resizeMode="contain"
            />
            {status.content && (
              <View style={styles.storyImageCaption}>
                <Text style={styles.storyImageCaptionText}>{status.content}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.storyContentBox}>
            <Text style={styles.storyContentText}>
              {status.content || ''}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    )
  }

  // ─── Status List Item ──────────────────────────────────────
  const renderStatusItem = ({ item }) => {
    const recentStatus = item.statuses[0]
    const hasUnviewed = item.statuses.some((s) => !viewedIds.has(s.id))
    const hasImage = recentStatus?.media_type === 'image' && recentStatus?.media_url

    return (
      <TouchableOpacity
        style={styles.statusItem}
        onPress={() => openStory(item.user, item.statuses)}
        activeOpacity={0.7}
      >
        <View style={[
          styles.statusAvatar,
          hasUnviewed ? styles.statusAvatarUnviewed : styles.statusAvatarViewed,
        ]}>
          {hasImage ? (
            <Image
              source={{ uri: recentStatus.media_url }}
              style={styles.statusAvatarImage}
            />
          ) : (
            <Text style={styles.statusAvatarText}>
              {item.user?.display_name?.charAt(0).toUpperCase() || '?'}
            </Text>
          )}
        </View>
        <View style={styles.statusInfo}>
          <Text style={[styles.statusName, hasUnviewed && styles.statusNameActive]}>
            {item.user?.display_name || 'Unknown'}
          </Text>
          <Text style={styles.statusTime}>
            {recentStatus?.content
              ? (recentStatus.content.length > 30
                  ? recentStatus.content.substring(0, 30) + '…'
                  : recentStatus.content)
              : hasImage
                ? '📷 Photo'
                : ''}
            {' · '}{getTimeAgo(recentStatus?.created_at)}
            {hasUnviewed ? ' · New' : ''}
          </Text>
        </View>
        {!hasUnviewed && (
          <Ionicons name="checkmark-done" size={18} color="#555" />
        )}
      </TouchableOpacity>
    )
  }

  // ─── Main Render ───────────────────────────────────────────
  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#6c63ff" /></View>
      ) : (
        <FlatList
          data={[
            ...(recentStatusList.length > 0 ? [{ type: 'section', key: 'recent', title: 'Recent updates' }] : []),
            ...recentStatusList.map((s) => ({ type: 'status', ...s, key: s.user?.id || s.user_id })),
            ...(viewedStatusList.length > 0 ? [{ type: 'section', key: 'viewed', title: 'Viewed updates' }] : []),
            ...viewedStatusList.map((s) => ({ type: 'status', ...s, key: `viewed-${s.user?.id || s.user_id}` })),
          ]}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={renderCirclesRow}
          renderItem={({ item }) => {
            if (item.type === 'section') {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{item.title}</Text>
                </View>
              )
            }
            return renderStatusItem({ item })
          }}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="cellular-outline" size={36} color="#333" />
              </View>
              <Text style={styles.emptyTitle}>No updates yet</Text>
              <Text style={styles.emptyText}>
                Status updates from people you chat with appear here for 24 hours
              </Text>
            </View>
          }
          refreshing={loading}
          onRefresh={fetchStatuses}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => {
        setStatusText('')
        setSelectedImage(null)
        setShowCreate(true)
      }}>
        <Ionicons name="camera" size={24} color="#fff" />
      </TouchableOpacity>

      {/* ─── Create Status Modal ─────────────────────────── */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.createOverlay}>
          <View style={styles.createContent}>
            <View style={styles.createHeader}>
              <TouchableOpacity onPress={() => {
                setShowCreate(false)
                setSelectedImage(null)
              }}>
                <Text style={styles.createCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.createTitle}>My Status</Text>
              <TouchableOpacity
                onPress={createStatus}
                disabled={(!statusText.trim() && !selectedImage) || creating}
              >
                {creating ? (
                  <ActivityIndicator color="#6c63ff" size="small" />
                ) : (
                  <Text style={[
                    styles.createPostText,
                    !statusText.trim() && !selectedImage && styles.createPostTextDisabled,
                  ]}>
                    Post
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.createBody}>
              {/* Image preview */}
              {selectedImage ? (
                <View style={styles.imagePreviewContainer}>
                  <Image
                    source={{ uri: selectedImage.uri }}
                    style={styles.imagePreview}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={styles.removeImageBtn}
                    onPress={removeSelectedImage}
                  >
                    <Ionicons name="close-circle" size={24} color="#ff4757" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.createAvatar} onPress={handlePickImage}>
                  <Text style={styles.createAvatarText}>
                    {user?.email?.charAt(0).toUpperCase() || '?'}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.createInputArea}>
                <TextInput
                  style={styles.createInput}
                  placeholder={selectedImage ? 'Add a caption...' : "What's on your mind?"}
                  placeholderTextColor="#555"
                  value={statusText}
                  onChangeText={setStatusText}
                  multiline
                  maxLength={200}
                  autoFocus={!selectedImage}
                />
                {!selectedImage && (
                  <TouchableOpacity style={styles.addImageBtn} onPress={handlePickImage}>
                    <Ionicons name="image-outline" size={24} color="#6c63ff" />
                    <Text style={styles.addImageText}>Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Story Viewer ────────────────────────────────── */}
      <Modal visible={!!viewingUser} transparent animationType="fade">
        <View style={styles.storyOverlay}>
          <StatusBar hidden />

          {/* Top bar */}
          <View style={styles.storyTopBar}>
            <View style={styles.storyUserInfo}>
              <View style={styles.storyAvatar}>
                <Text style={styles.storyAvatarText}>
                  {viewingUser?.user?.display_name?.charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
              <View>
                <Text style={styles.storyUserName}>
                  {viewingUser?.user?.display_name || 'Unknown'}
                </Text>
                <Text style={styles.storyTime}>
                  {viewingUser?.statuses?.[currentStatusIndex] && getTimeAgo(viewingUser.statuses[currentStatusIndex].created_at)}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={closeStory} style={styles.storyCloseBtn}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Story content */}
          {renderStoryContent(viewingUser?.statuses?.[currentStatusIndex])}

          {/* Bottom info */}
          <View style={styles.storyBottomBar}>
            {viewerNames ? (
              <Text style={styles.storyViewerText}>
                <Ionicons name="eye-outline" size={14} color="#888" /> Seen by {viewerNames}
              </Text>
            ) : (
              <Text style={styles.storyViewerText}>
                <Ionicons name="eye-off-outline" size={14} color="#555" /> No views yet
              </Text>
            )}

            {viewingUser && viewingUser.statuses.length > 1 && (
              <View style={styles.storyDots}>
                {viewingUser.statuses.map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.storyDot,
                      i === currentStatusIndex && styles.storyDotActive,
                    ]}
                    onPress={() => setCurrentStatusIndex(i)}
                  />
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingBottom: 80 },

  // ─── Circles Row ──────────────────────────────────────────
  circlesSection: { paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a' },
  circlesScroll: { paddingHorizontal: 16, gap: 16, alignItems: 'flex-start' },
  avatarCircleWrapper: { alignItems: 'center', width: 76 },
  avatarRing: {
    width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2,
    justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent',
    borderWidth: 3, borderColor: '#2a2a4a', marginBottom: 6,
  },
  avatarRingActive: { borderColor: '#2ecc71' },
  avatarRingUnviewed: { borderColor: '#2ecc71', borderWidth: 3 },
  avatarCircle: {
    width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#2a2a4a', justifyContent: 'center', alignItems: 'center',
  },
  myAvatarCircle: { backgroundColor: '#6c63ff' },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '600' },
  avatarLabel: { color: '#888', fontSize: 12, textAlign: 'center', fontWeight: '500' },
  avatarLabelActive: { color: '#fff', fontWeight: '600' },
  noCirclesHint: { height: AVATAR_SIZE + 32, justifyContent: 'center', paddingLeft: 8 },
  noCirclesText: { color: '#444', fontSize: 14 },

  // ─── Section Header ───────────────────────────────────────
  sectionHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  sectionTitle: {
    color: '#888', fontSize: 14, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // ─── Status List Items ────────────────────────────────────
  statusItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 },
  statusAvatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  statusAvatarUnviewed: { backgroundColor: '#6c63ff', borderWidth: 3, borderColor: '#2ecc71' },
  statusAvatarViewed: { backgroundColor: '#2a2a4a', borderWidth: 1, borderColor: '#3a3a5a' },
  statusAvatarImage: { width: 52, height: 52, borderRadius: 26 },
  statusAvatarText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  statusInfo: { flex: 1 },
  statusName: { color: '#ccc', fontSize: 16, fontWeight: '500', marginBottom: 2 },
  statusNameActive: { color: '#fff', fontWeight: '600' },
  statusTime: { color: '#888', fontSize: 13 },

  // ─── Empty State ──────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: 40 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 8 },
  emptyText: { color: '#888', fontSize: 15, textAlign: 'center', lineHeight: 22 },

  // ─── FAB ──────────────────────────────────────────────────
  fab: {
    position: 'absolute', right: 20, bottom: 20, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#6c63ff', justifyContent: 'center',
    alignItems: 'center', elevation: 8, shadowColor: '#6c63ff',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },

  // ─── Create Modal ─────────────────────────────────────────
  createOverlay: { flex: 1, backgroundColor: '#1a1a2e' },
  createContent: { flex: 1, paddingTop: 60 },
  createHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a',
  },
  createCancelText: { color: '#888', fontSize: 16 },
  createTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  createPostText: { color: '#6c63ff', fontSize: 16, fontWeight: '600' },
  createPostTextDisabled: { color: '#444' },
  createBody: { flex: 1, padding: 20, flexDirection: 'row', gap: 14 },
  createAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#6c63ff',
    justifyContent: 'center', alignItems: 'center',
  },
  createAvatarText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  createInputArea: { flex: 1 },
  createInput: { flex: 1, color: '#fff', fontSize: 18, lineHeight: 26, paddingTop: 8, minHeight: 80 },
  addImageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 16, paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: 'rgba(108,99,255,0.1)', borderRadius: 12,
    alignSelf: 'flex-start',
  },
  addImageText: { color: '#6c63ff', fontSize: 15, fontWeight: '500' },
  imagePreviewContainer: {
    width: 120, height: 200, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#16213e',
  },
  imagePreview: { width: '100%', height: '100%' },
  removeImageBtn: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#1a1a2e', borderRadius: 12,
  },

  // ─── Story Viewer ─────────────────────────────────────────
  storyOverlay: { flex: 1, backgroundColor: '#000' },
  storyTopBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16,
  },
  storyUserInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  storyAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#6c63ff',
    justifyContent: 'center', alignItems: 'center',
  },
  storyAvatarText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  storyUserName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  storyTime: { color: '#888', fontSize: 13, marginTop: 2 },
  storyCloseBtn: { padding: 8 },
  storyContentArea: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 8,
  },
  storyImageContainer: {
    flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center',
  },
  storyImage: {
    width: '100%',
    height: '80%',
    borderRadius: 16,
  },
  storyImageCaption: {
    position: 'absolute', bottom: 20, left: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  storyImageCaptionText: { color: '#fff', fontSize: 16, textAlign: 'center' },
  storyContentBox: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 24,
    padding: 32, width: '100%', minHeight: 200,
    justifyContent: 'center', alignItems: 'center',
  },
  storyContentText: { color: '#fff', fontSize: 22, lineHeight: 32, textAlign: 'center' },
  storyBottomBar: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 48, gap: 12 },
  storyViewerText: { color: '#888', fontSize: 14, textAlign: 'center' },
  storyDots: { flexDirection: 'row', gap: 8 },
  storyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#333' },
  storyDotActive: { backgroundColor: '#6c63ff', width: 24 },
})
