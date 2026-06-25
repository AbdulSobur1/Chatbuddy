import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import AppNavigator from './navigation/AppNavigator'
import { useAuthStore } from './lib/store'
import { supabase } from './lib/supabase'
import { registerForPushNotifications, addNotificationTapListener } from './lib/notifications'
import { ToastProvider } from './components/Toast'

export default function App() {
  const loadSession = useAuthStore((s) => s.loadSession)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    loadSession()
  }, [])

  // ─── Push notification setup ──────────────────────────────
  useEffect(() => {
    if (!user) return
    registerForPushNotifications(user.id)
    const subscription = addNotificationTapListener()
    return () => {
      if (subscription) subscription.remove()
    }
  }, [user])

  // ─── Update last_seen every 60 seconds ────────────────────
  useEffect(() => {
    if (!user) return
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
      <ToastProvider>
        <StatusBar style="light" />
        <AppNavigator />
      </ToastProvider>
    </GestureHandlerRootView>
  )
}
