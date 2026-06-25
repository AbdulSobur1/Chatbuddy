// ═══════════════════════════════════════════════════════════════
// Supabase Client — ChatBuddy
// ═══════════════════════════════════════════════════════════════
// Credentials come from .env.local or process environment.
// Never hardcode API keys in source files!
// ═══════════════════════════════════════════════════════════════

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

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase credentials. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file. ' +
    'Copy .env.example to .env and fill in your Supabase project details.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
