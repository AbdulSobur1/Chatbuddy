// ────────────────────────────────────────────────────────────
// ChatBuddy — Supabase Edge Function: send-notification
// Deploy via: supabase functions deploy send-notification
//
// Triggered by a Database Webhook on the messages table INSERT
// Sends Expo Push Notifications to the message recipient
// ────────────────────────────────────────────────────────────

// Follow the Deno module conventions for Supabase Edge Functions
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

interface NotificationPayload {
  type: 'INSERT'
  table: string
  schema: string
  record: {
    id: string
    channel_id: string
    sender_id: string
    content: string | null
    file_url: string | null
    created_at: string
  }
}

interface UserRecord {
  id: string
  display_name: string
  push_token: string | null
}

interface ChannelRecord {
  id: string
  name: string
  channel_type: string
}

serve(async (req) => {
  try {
    const payload: NotificationPayload = await req.json()

    // Only handle INSERT events on the messages table
    if (payload.type !== 'INSERT' || payload.table !== 'messages') {
      return new Response('Not a message insert event', { status: 200 })
    }

    const { record } = payload
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // ── 1. Get the channel info ────────────────────────────
    const channelRes = await fetch(
      `${SUPABASE_URL}/rest/v1/channels?id=eq.${record.channel_id}&select=id,name,channel_type`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    )
    const channels: ChannelRecord[] = await channelRes.json()
    const channel = channels[0]
    if (!channel) {
      return new Response('Channel not found', { status: 200 })
    }

    // ── 2. Get the sender name ──────────────────────────────
    const senderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${record.sender_id}&select=display_name`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    )
    const senders: UserRecord[] = await senderRes.json()
    const senderName = senders[0]?.display_name || 'Someone'

    // ── 3. Get recipients (channel members, not the sender) ─
    // For broadcast channels, notify followers
    let recipientsQuery: string
    if (channel.channel_type === 'broadcast') {
      recipientsQuery = `${SUPABASE_URL}/rest/v1/channel_followers?channel_id=eq.${record.channel_id}&select=user_id`
    } else {
      recipientsQuery = `${SUPABASE_URL}/rest/v1/channel_members?channel_id=eq.${record.channel_id}&select=user_id`
    }

    const membersRes = await fetch(recipientsQuery, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    })
    const members: { user_id: string }[] = await membersRes.json()

    // Get push tokens for all members except the sender
    const recipientIds = members
      .map((m) => m.user_id)
      .filter((id) => id !== record.sender_id)

    if (recipientIds.length === 0) {
      return new Response('No other recipients', { status: 200 })
    }

    // Build the filter: id=in.(id1,id2,id3)
    const idFilter = recipientIds.map((id) => `"${id}"`).join(',')
    const tokensRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=in.(${idFilter})&select=push_token,display_name`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    )
    const usersWithTokens: UserRecord[] = await tokensRes.json()

    // ── 4. Build notification body ──────────────────────────
    const messagePreview = record.content
      ? record.content.length > 100
        ? record.content.substring(0, 100) + '…'
        : record.content
      : record.file_url
        ? '📎 Sent a file'
        : '📬 New message'

    const notificationBody = channel.channel_type === 'broadcast'
      ? `${senderName}: ${messagePreview}`
      : messagePreview

    // ── 5. Send push notifications ──────────────────────────
    const expoPushMessages = usersWithTokens
      .filter((u) => u.push_token)
      .map((u) => ({
        to: u.push_token,
        sound: 'default',
        title: senderName,
        body: notificationBody,
        data: {
          channelId: record.channel_id,
          channelName: channel.name,
          channelType: channel.channel_type,
          messageId: record.id,
        },
        channelId: 'messages',
        priority: 'high',
      }))

    if (expoPushMessages.length === 0) {
      return new Response('No push tokens found', { status: 200 })
    }

    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(expoPushMessages),
    })

    const pushResult = await pushRes.json()

    return new Response(JSON.stringify({ sent: expoPushMessages.length, result: pushResult }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('send-notification error:', error)
    return new Response(error.message, { status: 500 })
  }
})
