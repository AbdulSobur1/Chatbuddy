import { createClient } from '@supabase/supabase-js'
import 'react-native-url-polyfill/auto'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const SecureStoreAdapter = {
  getItem: (key) => {
    if (Platform.OS === 'web') return Promise.resolve(localStorage.getItem(key))
    return SecureStore.getItemAsync(key)
  },
  setItem: (key, value) => {
    if (Platform.OS === 'web') return Promise.resolve(localStorage.setItem(key, value))
    return SecureStore.setItemAsync(key, value)
  },
  removeItem: (key) => {
    if (Platform.OS === 'web') return Promise.resolve(localStorage.removeItem(key))
    return SecureStore.deleteItemAsync(key)
  },
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://pfidvejfnssiioxtvqed.supabase.co'
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmaWR2ZWpmbnNzaWlveHR2cWVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDM1ODcsImV4cCI6MjA5NzYxOTU4N30.5OGfszXV-wtz__PWDnVw7ykx-UItyj_HzOlzfNFmm84'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
