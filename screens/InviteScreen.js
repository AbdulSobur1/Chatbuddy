import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'

export default function InviteScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)

  const handleJoin = async () => {
    if (!inviteCode.trim()) {
      Alert.alert('Error', 'Please enter an invite code')
      return
    }

    setJoining(true)
    try {
      const { data: channel, error } = await supabase
        .from('channels')
        .select('*')
        .eq('invite_code', inviteCode.trim().toUpperCase())
        .single()

      if (error || !channel) {
        Alert.alert('Invalid Code', 'No group or channel found with that invite code')
        return
      }

      if (channel.channel_type === 'broadcast') {
        // Follow the channel
        await supabase.from('channel_followers').insert({
          channel_id: channel.id,
          user_id: user.id,
        })
        Alert.alert('Joined Channel!', `You are now following "${channel.name}"`, [
          { text: 'OK', onPress: () => navigation.navigate('ChannelsTab') },
        ])
      } else if (channel.channel_type === 'group') {
        // Check if already a member
        const { data: existing } = await supabase
          .from('channel_members')
          .select('*')
          .eq('channel_id', channel.id)
          .eq('user_id', user.id)
          .maybeSingle()

        if (existing) {
          Alert.alert('Already a Member', `You're already in "${channel.name}"`)
          return
        }

        // Add as member
        await supabase.from('channel_members').insert({
          channel_id: channel.id,
          user_id: user.id,
          role: 'member',
        })

        Alert.alert('Joined Group!', `You are now a member of "${channel.name}"`, [
          { text: 'View Group', onPress: () => navigation.navigate('GroupsTab') },
        ])
      } else {
        Alert.alert('Not Available', 'This code is for a private chat')
      }
    } catch (error) {
      Alert.alert('Error', error.message)
    } finally {
      setJoining(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="key" size={48} color="#6c63ff" />
        </View>
        <Text style={styles.title}>Join with Code</Text>
        <Text style={styles.subtitle}>
          Enter an invite code to join a group or channel
        </Text>

        <TextInput
          style={styles.codeInput}
          placeholder="ABC12345"
          placeholderTextColor="#555"
          value={inviteCode}
          onChangeText={(t) => setInviteCode(t.toUpperCase())}
          autoCapitalize="characters"
          maxLength={8}
          autoFocus
        />

        <TouchableOpacity
          style={[styles.joinButton, joining && styles.disabled]}
          onPress={handleJoin}
          disabled={joining}
        >
          {joining ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.joinButtonText}>Join</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  content: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(108,99,255,0.1)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
  },
  title: { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#888', fontSize: 15, textAlign: 'center', marginBottom: 40 },
  codeInput: {
    backgroundColor: '#16213e', borderRadius: 16, padding: 20, fontSize: 32,
    color: '#fff', borderWidth: 2, borderColor: '#2a2a4a', width: '100%',
    textAlign: 'center', letterSpacing: 8, marginBottom: 24,
  },
  joinButton: {
    backgroundColor: '#6c63ff', borderRadius: 12, padding: 16,
    width: '100%', alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  joinButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
