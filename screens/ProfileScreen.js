import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { colors, radius } from '../lib/theme'
import Avatar from '../components/Avatar'
import Input from '../components/Input'
import Button from '../components/Button'
import { useToast } from '../components/Toast'
import { ProfileCardSkeleton } from '../components/Skeleton'

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
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

      const response = await fetch(uri)
      const blob = await response.blob()

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, blob, { contentType: blob.type || 'image/jpeg', upsert: true })
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
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
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
})
