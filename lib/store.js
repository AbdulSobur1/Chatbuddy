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
          username: data.user.user_metadata?.username || displayName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user',
        })
      }
    } catch (e) {
      console.warn('Profile safety net error:', e)
    }

    return data
  },

  signUp: async (email, password, displayName, username) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName, username: username?.toLowerCase() } },
    })
    if (error) throw error
    return data
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },

  loadSession: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session, user: session?.user ?? null, loading: false })

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null, loading: false })
    })
  },
}))

// ─── DMs Store ───────────────────────────────────────────────
export const useDMsStore = create((set, get) => ({
  dms: [],
  loading: false,

  fetchDMs: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    set({ loading: true })
    const { data, error } = await supabase
      .from('channel_members')
      .select('channel_id, channels!inner(*)')
      .eq('user_id', user.id)

    if (error) {
      console.error('fetchDMs error:', error)
      set({ loading: false })
      return
    }

    const dms = data
      .map((cm) => cm.channels)
      .filter((c) => c && c.channel_type === 'dm')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    set({ dms, loading: false })
  },

  startDirectChat: async (otherUserId) => {
    const user = useAuthStore.getState().user
    if (!user) return null

    // Check if DM already exists
    const { data: myMemberships } = await supabase
      .from('channel_members')
      .select('channel_id, channels!inner(channel_type)')
      .eq('user_id', user.id)

    if (myMemberships && myMemberships.length > 0) {
      const dmIds = myMemberships
        .filter((m) => m.channels?.channel_type === 'dm')
        .map((m) => m.channel_id)

      if (dmIds.length > 0) {
        const { data: shared } = await supabase
          .from('channel_members')
          .select('channel_id')
          .in('channel_id', dmIds)
          .eq('user_id', otherUserId)

        if (shared && shared.length > 0) {
          const { data: channel } = await supabase
            .from('channels')
            .select('*')
            .eq('id', shared[0].channel_id)
            .single()
          if (channel) return channel
        }
      }
    }

    // Create new DM
    const { data: channel, error } = await supabase
      .from('channels')
      .insert({
        name: 'Direct Chat',
        created_by: user.id,
        channel_type: 'dm',
        is_group: false,
      })
      .select()
      .single()

    if (error) throw error

    const members = [
      { channel_id: channel.id, user_id: user.id, role: 'owner' },
      { channel_id: channel.id, user_id: otherUserId, role: 'member' },
    ]

    const { error: mError } = await supabase.from('channel_members').insert(members)
    if (mError) throw mError

    await get().fetchDMs()
    return channel
  },
}))

// ─── Groups Store ────────────────────────────────────────────
export const useGroupsStore = create((set, get) => ({
  groups: [],
  loading: false,

  fetchGroups: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    set({ loading: true })
    const { data, error } = await supabase
      .from('channel_members')
      .select('channel_id, channels!inner(*)')
      .eq('user_id', user.id)

    if (error) {
      console.error('fetchGroups error:', error)
      set({ loading: false })
      return
    }

    const groups = data
      .map((cm) => cm.channels)
      .filter((c) => c && c.channel_type === 'group')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    set({ groups, loading: false })
  },

  createGroup: async (name, userIds = []) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { data: channel, error } = await supabase
      .from('channels')
      .insert({
        name,
        created_by: user.id,
        channel_type: 'group',
        is_group: true,
      })
      .select()
      .single()

    if (error) throw error

    // Add creator
    await supabase.from('channel_members').insert({
      channel_id: channel.id,
      user_id: user.id,
      role: 'owner',
    })

    // Add other members
    for (const uid of [...new Set(userIds)]) {
      if (uid !== user.id) {
        await supabase.from('channel_members').insert({
          channel_id: channel.id,
          user_id: uid,
          role: 'member',
        })
      }
    }

    await get().fetchGroups()
    return channel
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

  // ── Read Receipts ───────────────────────────────────────

  readStatusByChannel: {},
  readStatusSubscriptions: {},

  fetchReadStatus: async (channelId) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { data } = await supabase
      .from('channel_members')
      .select('user_id, last_read_message_id')
      .eq('channel_id', channelId)

    if (data) {
      const statusMap = {}
      data.forEach((m) => {
        statusMap[m.user_id] = m.last_read_message_id
      })
      set((state) => ({
        readStatusByChannel: {
          ...state.readStatusByChannel,
          [channelId]: statusMap,
        },
      }))
    }
  },

  subscribeToReadStatus: (channelId) => {
    const { readStatusSubscriptions } = get()
    if (readStatusSubscriptions[channelId]) return

    const subscription = supabase
      .channel(`read-status:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'channel_members',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          if (!payload.new) return
          const { user_id, last_read_message_id } = payload.new
          set((state) => {
            const prev = state.readStatusByChannel[channelId] || {}
            if (prev[user_id] === last_read_message_id) return state
            return {
              readStatusByChannel: {
                ...state.readStatusByChannel,
                [channelId]: { ...prev, [user_id]: last_read_message_id },
              },
            }
          })
        }
      )
      .subscribe()

    set((state) => ({
      readStatusSubscriptions: {
        ...state.readStatusSubscriptions,
        [channelId]: subscription,
      },
    }))
  },

  unsubscribeFromReadStatus: (channelId) => {
    const { readStatusSubscriptions } = get()
    if (readStatusSubscriptions[channelId]) {
      supabase.removeChannel(readStatusSubscriptions[channelId])
      set((state) => {
        const newSubs = { ...state.readStatusSubscriptions }
        delete newSubs[channelId]
        return { readStatusSubscriptions: newSubs }
      })
    }
  },

  markChannelAsRead: async (channelId) => {
    const user = useAuthStore.getState().user
    if (!user) return

    // Get the latest message ID in this channel
    const { data } = await supabase
      .from('messages')
      .select('id')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data?.id) return

    // Call the RPC function (handles the conditional update server-side)
    await supabase.rpc('mark_channel_read', {
      channel_id: channelId,
      message_id: data.id,
    })
  },

  cleanup: () => {
    const { subscriptions, readStatusSubscriptions } = get()
    Object.keys(subscriptions).forEach((channelId) => {
      supabase.removeChannel(subscriptions[channelId])
    })
    Object.keys(readStatusSubscriptions).forEach((channelId) => {
      supabase.removeChannel(readStatusSubscriptions[channelId])
    })
    set({ subscriptions: {}, messagesByChannel: {}, readStatusSubscriptions: {}, readStatusByChannel: {} })
  },
}))

// ─── Channels (Broadcast) Store ──────────────────────────────
export const useBroadcastStore = create((set) => ({
  channels: [],
  loading: false,

  fetchChannels: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    set({ loading: true })
    const { data, error } = await supabase
      .from('channels')
      .select('*, followers:channel_followers(count)')
      .eq('channel_type', 'broadcast')
      .order('created_at', { ascending: false })

    if (error) console.error('fetchBroadcast error:', error)
    else set({ channels: data || [] })
    set({ loading: false })
  },
}))

// ─── Status Store ────────────────────────────────────────────
export const useStatusStore = create((set) => ({
  myStatuses: [],
  contactsStatuses: [],
  loading: false,

  fetchStatuses: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    set({ loading: true })

    // My statuses
    const { data: mine } = await supabase
      .from('status_updates')
      .select('*')
      .eq('user_id', user.id)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    // Contacts statuses
    const { data: myChannels } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', user.id)

    let contactsStatuses = []
    if (myChannels && myChannels.length > 0) {
      const channelIds = myChannels.map((c) => c.channel_id)
      const { data: otherMembers } = await supabase
        .from('channel_members')
        .select('user_id')
        .in('channel_id', channelIds)
        .neq('user_id', user.id)

      if (otherMembers && otherMembers.length > 0) {
        const userIds = [...new Set(otherMembers.map((m) => m.user_id))]
        const { data: statusData } = await supabase
          .from('status_updates')
          .select('*, user:user_id(id, display_name)')
          .in('user_id', userIds)
          .gte('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
        contactsStatuses = statusData || []
      }
    }

    set({ myStatuses: mine || [], contactsStatuses, loading: false })
  },
}))
