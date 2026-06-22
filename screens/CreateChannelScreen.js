import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'

export default function CreateChannelScreen({ navigation }) {
  const user = useAuthStore((s) => s.user)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Channel name is required')
      return
    }

    setCreating(true)
    try {
      const { data: channel, error } = await supabase
        .from('channels')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          created_by: user.id,
          channel_type: 'broadcast',
          is_group: false,
        })
        .select()
        .single()

      if (error) throw error

      // Auto-follow as the creator
      await supabase.from('channel_followers').insert({
        channel_id: channel.id,
        user_id: user.id,
      })

      Alert.alert(
        'Channel Created!',
        `Share this invite code with others:\n\n${channel.invite_code}\n\nThey can join from the Channels tab.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      )
    } catch (error) {
      Alert.alert('Error', error.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="megaphone" size={48} color="#6c63ff" />
        </View>
        <Text style={styles.title}>Create a Channel</Text>
        <Text style={styles.subtitle}>
          Channels are one-way broadcast — you post, followers read
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Channel Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Tech News Daily"
            placeholderTextColor="#666"
            value={name}
            onChangeText={setName}
            maxLength={50}
            autoFocus
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="What's this channel about?"
            placeholderTextColor="#666"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={200}
          />
        </View>

        <TouchableOpacity
          style={[styles.createButton, creating && styles.disabled]}
          onPress={handleCreate}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>Create Channel</Text>
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
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  createButton: {
    backgroundColor: '#6c63ff', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 12,
  },
  disabled: { opacity: 0.6 },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
