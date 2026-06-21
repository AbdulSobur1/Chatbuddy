import { create } from 'zustand'
import { supabase } from './supabase'
import { Alert } from 'react-native'

// ─── Auth Store ──────────────────────────────────────────────
export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  loading: true,

  setSession: (session) => {
    set({
      session,
      user: session?.user ?? null,
      loading: false,
    })
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    set({ session: data.session, user: data.user })

    // Safety net: ensure user profile exists in public.users
    // (in case the database trigger didn't run for an existing user)
    try {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle()

      if (!existing) {
        const displayName = data.user.user_metadata?.display_name || email.split('@')[0]
        await supabase.from('users').insert({
          id: data.user.id,
          display_name: displayName,
        })
      }
    } catch (e) {
      console.warn('Profile safety net error:', e)
    }

    return data
  },

  signUp: async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) throw error
    // Profile is auto-created by the database trigger on auth.users insert
    return data
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },

  loadSession: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session, user: session?.user ?? null, loading: false })

    // Listen for auth changes
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null, loading: false })
    })
  },
}))

// ─── Channels Store ──────────────────────────────────────────
export const useChannelsStore = create((set, get) => ({
  channels: [],
  loading: false,

  fetchChannels: async () => {
    set({ loading: true })
    const user = useAuthStore.getState().user
    if (!user) return

    const { data, error } = await supabase
      .from('channel_members')
      .select('channel_id, channels(*)')
      .eq('user_id', user.id)

    if (error) {
      console.error('fetchChannels error:', error)
      set({ loading: false })
      return
    }

    const channels = data
      .map((cm) => cm.channels)
      .filter(Boolean)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    set({ channels, loading: false })
  },

  createChannel: async (name, userIds) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { data: channel, error } = await supabase
      .from('channels')
      .insert({ name, created_by: user.id, is_group: userIds.length >= 2 })
      .select()
      .single()

    if (error) throw error

    // Add all members including creator
    const members = [...new Set([user.id, ...userIds])].map((uid) => ({
      channel_id: channel.id,
      user_id: uid,
      role: uid === user.id ? 'owner' : 'member',
    }))

    const { error: membersError } = await supabase
      .from('channel_members')
      .insert(members)

    if (membersError) throw membersError

    await get().fetchChannels()
    return channel
  },

  startDirectChat: async (otherUserId) => {
    const user = useAuthStore.getState().user
    if (!user) return null

    // Check if direct chat already exists by looking for a 2-person channel
    const { data: existing } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', user.id)

    if (existing && existing.length > 0) {
      const channelIds = existing.map((cm) => cm.channel_id)
      // Find channels where the other user is also a member
      const { data: shared } = await supabase
        .from('channel_members')
        .select('channel_id')
        .in('channel_id', channelIds)
        .eq('user_id', otherUserId)

      if (shared && shared.length > 0) {
        // Get the channel details
        const { data: channel } = await supabase
          .from('channels')
          .select('*')
          .eq('id', shared[0].channel_id)
          .single()
        if (channel) return channel
      }
    }

    // Create new channel
    return await get().createChannel(
      'Direct Chat',
      [otherUserId]
    )
  },
}))

// ─── Messages Store ──────────────────────────────────────────
export const useMessagesStore = create((set, get) => ({
  messagesByChannel: {},
  subscriptions: {},

  fetchMessages: async (channelId) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:sender_id(id, display_name, avatar_url), reactions:message_reactions(*)')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('fetchMessages error:', error)
      return
    }

    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: data || [],
      },
    }))
  },

  subscribeToChannel: (channelId) => {
    const { subscriptions } = get()
    if (subscriptions[channelId]) return

    const subscription = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        () => {
          get().fetchMessages(channelId)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: undefined,
        },
        () => {
          get().fetchMessages(channelId)
        }
      )
      .subscribe()

    set((state) => ({
      subscriptions: { ...state.subscriptions, [channelId]: subscription },
    }))
  },

  unsubscribeFromChannel: (channelId) => {
    const { subscriptions } = get()
    if (subscriptions[channelId]) {
      supabase.removeChannel(subscriptions[channelId])
      set((state) => {
        const newSubs = { ...state.subscriptions }
        delete newSubs[channelId]
        return { subscriptions: newSubs }
      })
    }
  },

  sendMessage: async (channelId, content, fileUrl = null, replyToId = null) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { error } = await supabase.from('messages').insert({
      channel_id: channelId,
      sender_id: user.id,
      content,
      file_url: fileUrl,
      reply_to_id: replyToId,
    })

    if (error) {
      console.error('sendMessage error:', error)
      throw error
    }
  },

  editMessage: async (messageId, content) => {
    const { error } = await supabase
      .from('messages')
      .update({ content, edited_at: new Date().toISOString() })
      .eq('id', messageId)

    if (error) throw error
  },

  deleteMessage: async (messageId) => {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)

    if (error) throw error
  },

  addReaction: async (messageId, emoji) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { error } = await supabase.from('message_reactions').upsert(
      { message_id: messageId, user_id: user.id, emoji },
      { onConflict: 'message_id, user_id, emoji' }
    )

    if (error) console.error('addReaction error:', error)
  },

  removeReaction: async (messageId, emoji) => {
    const user = useAuthStore.getState().user
    if (!user) return

    await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
  },

  uploadFile: async (uri, fileName) => {
    const user = useAuthStore.getState().user
    if (!user) throw new Error('Not authenticated')

    const fileExt = fileName.split('.').pop()
    const filePath = `${user.id}/${Date.now()}.${fileExt}`

    const response = await fetch(uri)
    const blob = await response.blob()

    const { data, error } = await supabase.storage
      .from('chat-media')
      .upload(filePath, blob, {
        contentType: blob.type || 'application/octet-stream',
        upsert: true,
      })

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage
      .from('chat-media')
      .getPublicUrl(filePath)

    return publicUrl
  },

  cleanup: () => {
    const { subscriptions } = get()
    Object.keys(subscriptions).forEach((channelId) => {
      supabase.removeChannel(subscriptions[channelId])
    })
    set({ subscriptions: {}, messagesByChannel: {} })
  },
}))
