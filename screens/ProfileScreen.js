import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, Modal, Share, Image } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { useColors, radius } from '../lib/theme'
import Avatar from '../components/Avatar'
import Input from '../components/Input'
import Button from '../components/Button'
import { useToast } from '../components/Toast'
import { ProfileCardSkeleton } from '../components/Skeleton'
import QRCode from 'qrcode'

export default function ProfileScreen() {
  const colors = useColors()
  const user = useAuthStore((s) => s.user)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [qrGenerating, setQrGenerating] = useState(false)
  const toast = useToast()

  useEffect(() => { fetchProfile() }, [])

  const fetchProfile = async () => {
    if (!user) return
    const { data, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle()
    if (error) console.error('fetchProfile error:', error)
    else if (data) {
      setDisplayName(data.display_name || '')
      setUsername(data.username || '')
      setStatus(data.status || '')
      setAvatarUrl(data.avatar_url || null)
    }
    setLoading(false)
  }

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    })
    if (result.canceled || !result.assets[0]) return
    setUploading(true)
    try {
      const uri = result.assets[0].uri
      const fileExt = uri.split('.').pop() || 'jpg'
      const filePath = `avatars/${user.id}/${Date.now()}.${fileExt}`

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
      const binaryStr = atob(base64)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i) }

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, bytes.buffer, { contentType: 'image/jpeg', upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)
      if (updateError) throw updateError

      setAvatarUrl(publicUrl)
      toast.show('Profile photo updated!', 'success')
    } catch (error) {
      toast.show(error.message || 'Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  const saveProfile = async () => {
    if (!displayName.trim()) { toast.show('Display name is required', 'error'); return }
    setSaving(true)
    const { error } = await supabase
      .from('users')
      .update({
        display_name: displayName.trim(),
        username: username.trim().toLowerCase(),
        status: status.trim() || null,
      })
      .eq('id', user.id)
    if (error) toast.show(error.message, 'error')
    else toast.show('Profile updated successfully', 'success')
    setSaving(false)
  }

  const handleShowQR = useCallback(async () => {
    setQrGenerating(true)
    setShowQR(true)
    try {
      const profileData = JSON.stringify({
        id: user?.id,
        display_name: displayName || user?.user_metadata?.display_name || '',
        username: username || '',
      })
      const dataUrl = await QRCode.toDataURL(profileData, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      })
      setQrDataUrl(dataUrl)
    } catch (error) {
      console.error('QR generation failed:', error)
      toast.show('Failed to generate QR code', 'error')
    } finally {
      setQrGenerating(false)
    }
  }, [user?.id, displayName, username])

  const handleShareQR = useCallback(async () => {
    if (!qrDataUrl) return
    try {
      const text = `ChatBuddy Profile — ${displayName || 'User'}\nID: ${user?.id || ''}`
      await Share.share({
        message: text,
        title: `${displayName || 'User'}'s ChatBuddy Profile`,
      })
    } catch {}
  }, [qrDataUrl, displayName, user?.id])

  const styles = useMemo(() => makeStyles(colors), [colors])

  if (loading) return <View style={[styles.container, styles.center]}><ProfileCardSkeleton /></View>

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.avatarSection}>
        <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8}>
          <View style={styles.avatarWrapper}>
            <Avatar name={displayName || user?.email} imageUrl={avatarUrl} size="xxl" />
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </View>
        </TouchableOpacity>
        <Text style={styles.email}>{user?.email}</Text>
        {uploading && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
      </View>

      <View style={styles.form}>
        <Input label="Display Name" placeholder="Your display name" value={displayName} onChangeText={setDisplayName} icon="person-outline" />
        <Input label="Username" placeholder="username" value={username} onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))} icon="at-outline" hint="Your unique @handle. Others will find you by this." />
        <Input label="Status" placeholder="What's on your mind?" value={status} onChangeText={setStatus} icon="chatbubble-ellipses-outline" multiline maxLength={100} />
        <Button title="Save Changes" onPress={saveProfile} loading={saving} disabled={saving} size="lg" fullWidth style={{ marginTop: 12 }} />
        <TouchableOpacity
          style={styles.qrButton}
          onPress={handleShowQR}
          activeOpacity={0.7}
        >
          <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
          <Text style={styles.qrButtonText}>Share Profile QR Code</Text>
        </TouchableOpacity>
      </View>

      {/* QR Code Modal */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <TouchableOpacity
          style={styles.qrOverlay}
          activeOpacity={1}
          onPress={() => setShowQR(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.qrCard} onPress={() => {}}>
            <Text style={styles.qrTitle}>{displayName || 'Profile'}</Text>
            <Text style={styles.qrSubtitle}>@{username || 'username'}</Text>
            {qrGenerating ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 40 }} />
            ) : qrDataUrl ? (
              <Image source={{ uri: qrDataUrl }} style={styles.qrImage} />
            ) : null}
            <Text style={styles.qrHint}>Scan to add contact</Text>
            <View style={styles.qrActions}>
              <TouchableOpacity style={styles.qrActionBtn} onPress={handleShareQR}>
                <Ionicons name="share-outline" size={20} color={colors.primary} />
                <Text style={styles.qrActionText}>Share Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.qrActionBtn} onPress={() => setShowQR(false)}>
                <Ionicons name="close-outline" size={20} color={colors.textMuted} />
                <Text style={[styles.qrActionText, { color: colors.textMuted }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  avatarSection: { alignItems: 'center', paddingVertical: 32, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  avatarWrapper: { position: 'relative' },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: colors.bg,
  },
  email: { color: colors.textMuted, fontSize: 14, marginTop: 12 },
  form: { paddingHorizontal: 24, paddingTop: 24 },
  qrButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, marginTop: 16,
    borderRadius: radius.md, borderWidth: 1, borderColor: `${colors.primary}30`,
    backgroundColor: `${colors.primary}08`,
  },
  qrButtonText: { color: colors.primary, fontSize: 15, fontWeight: '500' },
  qrOverlay: {
    flex: 1, backgroundColor: colors.overlayHeavy,
    justifyContent: 'center', alignItems: 'center',
    padding: 24,
  },
  qrCard: {
    backgroundColor: '#ffffff', borderRadius: radius.xl,
    padding: 32, alignItems: 'center', width: '100%', maxWidth: 340,
  },
  qrTitle: { color: '#1a1a2e', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  qrSubtitle: { color: '#666680', fontSize: 14, marginBottom: 24 },
  qrImage: { width: 240, height: 240, borderRadius: radius.md },
  qrHint: { color: '#9999aa', fontSize: 13, marginTop: 16, fontStyle: 'italic' },
  qrActions: {
    flexDirection: 'row', gap: 12, marginTop: 20,
  },
  qrActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: radius.md, backgroundColor: '#f0f0f5',
  },
  qrActionText: { color: colors.primary, fontSize: 14, fontWeight: '500' },
})
