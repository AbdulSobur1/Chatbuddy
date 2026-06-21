import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import AppNavigator from './navigation/AppNavigator'
import { useAuthStore } from './lib/store'
import { supabase } from './lib/supabase'

export default function App() {
  const loadSession = useAuthStore((s) => s.loadSession)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    loadSession()
  }, [])

  useEffect(() => {
    if (!user) return

    // Update last_seen every 60 seconds
    const updateLastSeen = async () => {
      await supabase
        .from('users')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', user.id)
    }

    updateLastSeen()
    const interval = setInterval(updateLastSeen, 60000)

    return () => clearInterval(interval)
  }, [user])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <AppNavigator />
    </GestureHandlerRootView>
  )
}
