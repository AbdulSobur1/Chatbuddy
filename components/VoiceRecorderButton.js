import React, { useState, useRef, useMemo } from 'react'
import { TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAudioRecorder, requestRecordingPermissionsAsync, setAudioModeAsync, RecordingPresets } from 'expo-audio'
import { useColors } from '../lib/theme'
import { useToast } from './Toast'

// ─── ErrorBoundary-safe wrapper for the voice recorder ───────
// Isolates the useAudioRecorder hook so if the native module fails,
// only this button breaks instead of the entire ChatScreen.
export default function VoiceRecorderButton({ onRecordingComplete }) {
  const colors = useColors()
  const toast = useToast()
  const [isRecording, setIsRecording] = useState(false)
  const [initializing, setInitializing] = useState(false)

  // This hook is isolated here — if it throws, ChatScreen won't crash
  let recorder
  try {
    recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  } catch (e) {
    console.warn('VoiceRecorderButton: useAudioRecorder failed', e)
    recorder = null
  }

  const handlePressIn = async () => {
    if (!recorder) {
      toast.show('Voice recording not available on this device', 'warning')
      return
    }
    try {
      setInitializing(true)
      const { granted } = await requestRecordingPermissionsAsync()
      if (!granted) {
        toast.show('Microphone access required for voice notes', 'warning')
        return
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      })

      await recorder.prepareToRecordAsync()
      recorder.record()
      setIsRecording(true)
    } catch (error) {
      toast.show(error.message || 'Recording failed', 'error')
    } finally {
      setInitializing(false)
    }
  }

  const handlePressOut = async () => {
    if (!recorder || !recorder.isRecording) return
    setIsRecording(false)
    try {
      await recorder.stop()
      const uri = recorder.uri
      if (uri) {
        await onRecordingComplete(uri)
      } else {
        toast.show('Failed to get recording', 'error')
      }
    } catch (error) {
      toast.show(error.message || 'Upload failed', 'error')
    }
  }

  const styles = useMemo(() => StyleSheet.create({
    button: {
      width: 40, height: 40, borderRadius: 20,
      justifyContent: 'center', alignItems: 'center',
    },
    recording: { backgroundColor: colors.danger },
    normal: { backgroundColor: colors.primary },
  }), [colors])

  return (
    <TouchableOpacity
      style={[styles.button, isRecording ? styles.recording : styles.normal]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={initializing}
    >
      {initializing ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Ionicons
          name={isRecording ? 'mic' : 'mic-outline'}
          size={22}
          color="#fff"
        />
      )}
    </TouchableOpacity>
  )
}
