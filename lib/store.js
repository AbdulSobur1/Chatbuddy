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

  // ── Scheduled Messages ────────────────────────────────────

  scheduleMessage: async (channelId, content, scheduledAt, fileUrl = null, replyToId = null) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { error } = await supabase.from('messages').insert({
      channel_id: channelId,
      sender_id: user.id,
      content,
      file_url: fileUrl,
      reply_to_id: replyToId,
      scheduled_at: scheduledAt.toISOString(),
    })

    if (error) {
      console.error('scheduleMessage error:', error)
      throw error
    }
  },

  // Poll for and send any scheduled messages that are due
  processScheduledMessages: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('messages')
      .select('id')
      .eq('sender_id', user.id)
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', now)

    if (error) {
      console.error('processScheduledMessages error:', error)
      return
    }

    // Clear scheduled_at for due messages (they'll appear in the next fetch)
    for (const msg of data || []) {
      await supabase
        .from('messages')
        .update({ scheduled_at: null })
        .eq('id', msg.id)
    }
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

  // ── Mute Notifications ─────────────────────────────────────

  mutedChannels: {},

  fetchMuteStatus: async (channelId) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { data } = await supabase
      .from('channel_members')
      .select('muted_until')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (data) {
      const isMuted = data.muted_until && new Date(data.muted_until) > new Date()
      set((state) => ({
        mutedChannels: { ...state.mutedChannels, [channelId]: !!isMuted },
      }))
    }
  },

  toggleMute: async (channelId, durationHours = null) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { mutedChannels } = get()
    const currentlyMuted = mutedChannels[channelId]
    const previousState = { ...mutedChannels }

    try {
      if (currentlyMuted) {
        // Unmute
        await supabase
          .from('channel_members')
          .update({ muted_until: null })
          .eq('channel_id', channelId)
          .eq('user_id', user.id)

        set((state) => ({
          mutedChannels: { ...state.mutedChannels, [channelId]: false },
        }))
      } else {
        // Mute: if no duration specified, mute for 8 hours
        const hours = durationHours || 8
        const mutedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

        await supabase
          .from('channel_members')
          .update({ muted_until: mutedUntil })
          .eq('channel_id', channelId)
          .eq('user_id', user.id)

        set((state) => ({
          mutedChannels: { ...state.mutedChannels, [channelId]: true },
        }))
      }
    } catch (error) {
      console.error('toggleMute error:', error)
      set({ mutedChannels: previousState })
    }
  },

  // ── Pin Chats ───────────────────────────────────────────

  pinnedChannels: new Set(),

  fetchPinnedChannels: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { data } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', user.id)
      .not('pinned_at', 'is', null)

    if (data) {
      set({ pinnedChannels: new Set(data.map((m) => m.channel_id)) })
    }
  },

  pinChannel: async (channelId) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { error } = await supabase
      .from('channel_members')
      .update({ pinned_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .eq('user_id', user.id)

    if (error) {
      console.error('pinChannel error:', error)
      throw error
    }
    set((state) => ({
      pinnedChannels: new Set([...state.pinnedChannels, channelId]),
    }))
  },

  unpinChannel: async (channelId) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { error } = await supabase
      .from('channel_members')
      .update({ pinned_at: null })
      .eq('channel_id', channelId)
      .eq('user_id', user.id)

    if (error) {
      console.error('unpinChannel error:', error)
      throw error
    }
    set((state) => {
      const next = new Set(state.pinnedChannels)
      next.delete(channelId)
      return { pinnedChannels: next }
    })
  },

  // ── Chat Archiving ────────────────────────────────────────

  archiveChannel: async (channelId) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { error } = await supabase
      .from('channel_members')
      .update({ archived_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .eq('user_id', user.id)

    if (error) {
      console.error('archiveChannel error:', error)
      throw error
    }
  },

  unarchiveChannel: async (channelId) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { error } = await supabase
      .from('channel_members')
      .update({ archived_at: null })
      .eq('channel_id', channelId)
      .eq('user_id', user.id)

    if (error) {
      console.error('unarchiveChannel error:', error)
      throw error
    }
  },

  cleanup: () => {
    const { subscriptions, readStatusSubscriptions } = get()
    Object.keys(subscriptions).forEach((channelId) => {
      supabase.removeChannel(subscriptions[channelId])
    })
    Object.keys(readStatusSubscriptions).forEach((channelId) => {
      supabase.removeChannel(readStatusSubscriptions[channelId])
    })
    set({ subscriptions: {}, messagesByChannel: {}, readStatusSubscriptions: {}, readStatusByChannel: {}, mutedChannels: {} })
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

// ─── Block Users Store ───────────────────────────────────────
export const useBlockStore = create((set, get) => ({
  blockedUsers: [],
  blockedUserIds: new Set(),
  loading: false,

  fetchBlockedUsers: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    set({ loading: true })
    const { data } = await supabase
      .from('blocked_users')
      .select('blocked_id, blocked:blocked_id(display_name, username)')
      .eq('blocker_id', user.id)

    if (data) {
      const ids = new Set(data.map((b) => b.blocked_id))
      set({ blockedUsers: data || [], blockedUserIds: ids, loading: false })
    } else {
      set({ loading: false })
    }
  },

  blockUser: async (userId) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { error } = await supabase.from('blocked_users').insert({
      blocker_id: user.id,
      blocked_id: userId,
    })
    if (error) {
      console.error('blockUser error:', error)
      throw error
    }
    // Refresh the list
    await get().fetchBlockedUsers()
  },

  unblockUser: async (userId) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', userId)
    if (error) {
      console.error('unblockUser error:', error)
      throw error
    }
    await get().fetchBlockedUsers()
  },

  isBlocked: (userId) => {
    return get().blockedUserIds.has(userId)
  },
}))

// ─── AI Chat Assistant Store ──────────────────────────────────
export const useAIStore = create((set, get) => ({
  conversations: [],
  loading: false,
  sending: false,
  error: null,

  fetchConversations: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    set({ loading: true })
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) {
      console.error('fetchConversations error:', error)
      set({ loading: false })
      return
    }

    set({ conversations: data || [], loading: false })
  },

  sendToAI: async (message) => {
    const user = useAuthStore.getState().user
    if (!user) throw new Error('Not authenticated')

    set({ sending: true, error: null })

    // Get last 20 messages for context
    const { conversations } = get()
    const recentMessages = conversations.slice(-20)
    const history = recentMessages.map((c) => ({
      role: c.role,
      content: c.content,
    }))

    // Optimistically add user message
    const optimisticId = `opt-${Date.now()}`
    const optimisticMessage = {
      id: optimisticId,
      user_id: user.id,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    }
    set((state) => ({
      conversations: [...state.conversations, optimisticMessage],
    }))

    try {
      // Get the session token for auth
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) throw new Error('No session')

      const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
      if (!SUPABASE_URL) throw new Error('Supabase URL not configured')

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message, history }),
        }
      )

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(errData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()

      // Replace optimistic message with real one + add AI reply
      set((state) => {
        const filtered = state.conversations.filter((c) => c.id !== optimisticId)
        return {
          conversations: [
            ...filtered,
            {
              id: `user-${Date.now()}`,
              user_id: user.id,
              role: 'user',
              content: message,
              created_at: new Date().toISOString(),
            },
            {
              id: `ai-${Date.now()}`,
              user_id: user.id,
              role: 'assistant',
              content: data.reply,
              created_at: new Date().toISOString(),
            },
          ],
        }
      })
    } catch (error) {
      console.error('sendToAI error:', error)
      // Remove the optimistic message
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== optimisticId),
        error: error.message,
      }))
      throw error
    } finally {
      set({ sending: false })
    }
  },

  clearConversation: () => {
    const user = useAuthStore.getState().user
    if (!user) return

    set({ conversations: [] })

    // Also delete from Supabase
    supabase
      .from('ai_conversations')
      .delete()
      .eq('user_id', user.id)
      .then(({ error }) => {
        if (error) console.error('clearConversation error:', error)
      })
  },
}))
