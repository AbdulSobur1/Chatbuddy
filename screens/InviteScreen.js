import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'
import { colors, radius } from '../lib/theme'
import Button from '../components/Button'
import { useToast } from '../components/Toast'

export default function InviteScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)
  const toast = useToast()

  const handleJoin = async () => {
    if (!inviteCode.trim()) { toast.show('Please enter an invite code', 'error'); return }
    setJoining(true)
    try {
      const { data: channel } = await supabase.from('channels').select('*').eq('invite_code', inviteCode.trim().toUpperCase()).maybeSingle()
      if (!channel) { toast.show('No group or channel found with that code', 'error'); return }
      if (channel.channel_type === 'broadcast') {
        await supabase.from('channel_followers').insert({ channel_id: channel.id, user_id: user.id })
        toast.show(`Joined channel "${channel.name}"!`, 'success')
        navigation.navigate('ChannelsTab')
      } else if (channel.channel_type === 'group') {
        const { data: existing } = await supabase.from('channel_members').select('*').eq('channel_id', channel.id).eq('user_id', user.id).maybeSingle()
        if (existing) { toast.show(`You're already in "${channel.name}"`, 'info'); return }
        await supabase.from('channel_members').insert({ channel_id: channel.id, user_id: user.id, role: 'member' })
        toast.show(`Joined group "${channel.name}"!`, 'success')
        navigation.navigate('GroupsTab')
      } else { toast.show('This code is for a private chat', 'warning') }
    } catch { toast.show('Failed to join', 'error') } finally { setJoining(false) }
  }

  return (
    <View style={styles.container}>
      <View style={{ alignItems: 'center', paddingHorizontal: 32 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: `${colors.primary}15`, justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
          <Ionicons name="key" size={48} color={colors.primary} /></View>
        <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '700', marginBottom: 8 }}>Join with Code</Text>
        <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center', marginBottom: 40 }}>Enter an invite code to join a group or channel</Text>
        <TextInput style={styles.codeInput} placeholder="ABC12345" placeholderTextColor={colors.textMuted} value={inviteCode} onChangeText={(t) => setInviteCode(t.toUpperCase())} autoCapitalize="characters" maxLength={8} autoFocus />
        <Button title="Join" onPress={handleJoin} loading={joining} disabled={joining} size="lg" fullWidth />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' },
  codeInput: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, fontSize: 32, color: colors.textPrimary, borderWidth: 2, borderColor: colors.border, width: '100%', textAlign: 'center', letterSpacing: 8, marginBottom: 24 },
})
