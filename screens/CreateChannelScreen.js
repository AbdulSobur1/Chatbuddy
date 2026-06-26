import React, { useState, useMemo } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'
import { useColors, radius } from '../lib/theme'
import Button from '../components/Button'
import { useToast } from '../components/Toast'

export default function CreateChannelScreen({ navigation }) {
  const colors = useColors()
  const user = useAuthStore((s) => s.user)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const toast = useToast()

  const handleCreate = async () => {
    if (!name.trim()) { toast.show('Channel name is required', 'error'); return }
    setCreating(true)
    try {
      const { data: channel } = await supabase.from('channels').insert({ name: name.trim(), description: description.trim() || null, created_by: user.id, channel_type: 'broadcast', is_group: false }).select().single()
      await supabase.from('channel_followers').insert({ channel_id: channel.id, user_id: user.id })
      toast.show(`Channel "${channel.name}" created! Invite code: ${channel.invite_code}`, 'success')
      navigation.goBack()
    } catch (e) { toast.show(e.message, 'error') } finally { setCreating(false) }
  }

  const styles = useMemo(() => makeStyles(colors), [colors])

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ padding: 24 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: `${colors.primary}15`, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 16 }}>
          <Ionicons name="megaphone" size={48} color={colors.primary} /></View>
        <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: '700', textAlign: 'center' }}>Create a Channel</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 32, marginTop: 8 }}>One-way broadcast — you post, followers read</Text>
        <Text style={{ color: colors.textTertiary, fontSize: 14, marginBottom: 8, fontWeight: '500' }}>Channel Name</Text>
        <TextInput style={styles.input} placeholder="e.g. Tech News Daily" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} maxLength={50} autoFocus />
        <Text style={{ color: colors.textTertiary, fontSize: 14, marginBottom: 8, fontWeight: '500', marginTop: 20 }}>Description (optional)</Text>
        <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} placeholder="What's this channel about?" placeholderTextColor={colors.textMuted} value={description} onChangeText={setDescription} multiline maxLength={200} />
        <Button title="Create Channel" onPress={handleCreate} loading={creating} disabled={creating} size="lg" fullWidth style={{ marginTop: 20 }} />
      </View>
    </KeyboardAvoidingView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
})
