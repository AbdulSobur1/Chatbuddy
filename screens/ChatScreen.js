import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
  ActivityIndicator, Image, Modal, Animated,
  Share,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { Ionicons } from '@expo/vector-icons'
import { Swipeable } from 'react-native-gesture-handler'
import { useAuthStore, useMessagesStore, useBlockStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { useColors, radius } from '../lib/theme'
import ChatHeader from '../components/ChatHeader'
import { useToast } from '../components/Toast'
import VoiceRecorderButton from '../components/VoiceRecorderButton'
import { playTypingSound, cleanupSounds } from '../lib/sounds'

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const getScheduleOptions = () => {
  const today = new Date().getDay()
  const daysUntilNextMonday = ((1 - today + 7) % 7) || 7
  return [
    { label: 'In 1 hour', icon: 'time-outline', hours: 1 },
    { label: 'In 3 hours', icon: 'time-outline', hours: 3 },
    { label: 'Tomorrow morning', icon: 'sunny-outline', hours: 16 },
    { label: 'Tomorrow evening', icon: 'moon-outline', hours: 24 },
    { label: 'Next Monday', icon: 'calendar-outline', hours: daysUntilNextMonday * 24 },
  ]
}

export default function ChatScreen({ route, navigation }) {
  const colors = useColors()
  const { channel } = route.params
  const user = useAuthStore((s) => s.user)
  const {
    messagesByChannel, fetchMessages, subscribeToChannel, unsubscribeFromChannel,
    sendMessage, editMessage, deleteMessage, addReaction, removeReaction, uploadFile,
    fetchReadStatus, subscribeToReadStatus, unsubscribeFromReadStatus, markChannelAsRead,
    readStatusByChannel,
    fetchMuteStatus, toggleMute, mutedChannels,
    scheduleMessage, processScheduledMessages,
  } = useMessagesStore()

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [showActions, setShowActions] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editText, setEditText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [showForwardPicker, setShowForwardPicker] = useState(false)
  const [forwardChannels, setForwardChannels] = useState([])
  const [forwarding, setForwarding] = useState(false)
  const [lightboxImage, setLightboxImage] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduling, setScheduling] = useState(false)

  // ── Smart Reply Suggestions ───────────────────────
  const [smartReplies, setSmartReplies] = useState([])
  const [fetchingReplies, setFetchingReplies] = useState(false)
  const [expandedTranscripts, setExpandedTranscripts] = useState({})
  const [transcripts, setTranscripts] = useState({})

  const messages = messagesByChannel[channel.id] || []
  const flatListRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const typingChannelRef = useRef(null)
  const typingTimersRef = useRef({})
  const [typingUserIds, setTypingUserIds] = useState(new Set())
  const [otherUserInfo, setOtherUserInfo] = useState({ id: null, name: '' })
  const { blockUser, unblockUser, fetchBlockedUsers } = useBlockStore()
  const blockedUserIds = useBlockStore((s) => s.blockedUserIds)
  const [isBlockedState, setIsBlockedState] = useState(false)

  // Fetch the other user's info for DMs (both ID and name in one query)
  useEffect(() => {
    if (channel.channel_type !== 'dm') return
    const fetchOther = async () => {
      const { data } = await supabase
        .from('channel_members')
        .select('user_id, user:user_id(display_name)')
        .eq('channel_id', channel.id)
        .neq('user_id', user.id)
        .maybeSingle()
      if (data) {
        setOtherUserInfo({
          id: data.user_id,
          name: data.user?.display_name || '',
        })
      }
    }
    fetchOther()
  }, [channel.id, user])

  // Fetch block status
  useEffect(() => {
    if (!otherUserInfo.id) return
    fetchBlockedUsers()
  }, [otherUserInfo.id])

  useEffect(() => {
    setIsBlockedState(otherUserInfo.id ? blockedUserIds.has(otherUserInfo.id) : false)
  }, [otherUserInfo.id, blockedUserIds])

  // Mark channel as read when messages update (new messages arrive via subscription)
  const prevMessageCount = useRef(messages.length)
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      markChannelAsRead(channel.id)
    }
    prevMessageCount.current = messages.length
  }, [messages.length])

  useEffect(() => {
    fetchMessages(channel.id)
    subscribeToChannel(channel.id)
    fetchReadStatus(channel.id)
    subscribeToReadStatus(channel.id)
    fetchMuteStatus(channel.id)
    processScheduledMessages()

    // Mark channel as read on mount
    markChannelAsRead(channel.id)

    // Typing indicator channel — listen & broadcast
    typingChannelRef.current = supabase.channel(`typing:${channel.id}`, {
      config: { broadcast: { self: true } },
    })

    typingChannelRef.current
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === user.id) return // ignore self
        setTypingUserIds((prev) => {
          const next = new Set(prev)
          next.add(payload.userId)
          return next
        })
        playTypingSound() // subtle notification
        // Auto-dismiss after 3s if no stop_typing received
        clearTimeout(typingTimersRef.current[payload.userId])
        typingTimersRef.current[payload.userId] = setTimeout(() => {
          setTypingUserIds((prev) => {
            const next = new Set(prev)
            next.delete(payload.userId)
            return next
          })
        }, 3000)
      })
      .on('broadcast', { event: 'stop_typing' }, ({ payload }) => {
        if (payload.userId === user.id) return
        clearTimeout(typingTimersRef.current[payload.userId])
        delete typingTimersRef.current[payload.userId]
        setTypingUserIds((prev) => {
          const next = new Set(prev)
          next.delete(payload.userId)
          return next
        })
      })
      .subscribe()

    return () => {
      // Clear all typing timers
      Object.values(typingTimersRef.current).forEach(clearTimeout)
      typingTimersRef.current = {}
      unsubscribeFromChannel(channel.id)
      unsubscribeFromReadStatus(channel.id)
      if (typingChannelRef.current) {
        supabase.removeChannel(typingChannelRef.current)
      }
      cleanupSounds()
    }
  }, [channel.id])

  const handleTyping = () => {
    if (!typingChannelRef.current) return
    typingChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user.id },
    })

    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      if (typingChannelRef.current) {
        typingChannelRef.current.send({
          type: 'broadcast',
          event: 'stop_typing',
          payload: { userId: user.id },
        })
      }
    }, 2500)
  }

  const handleBlockUser = async () => {
    if (!otherUserInfo.id) return
    try {
      await blockUser(otherUserInfo.id)
      setIsBlockedState(true)
      toast.show(`${otherUserInfo.name || 'User'} blocked`, 'info')
    } catch (error) {
      toast.show('Failed to block user', 'error')
    }
  }

  const handleUnblockUser = async () => {
    if (!otherUserInfo.id) return
    try {
      await unblockUser(otherUserInfo.id)
      setIsBlockedState(false)
      toast.show(`${otherUserInfo.name || 'User'} unblocked`, 'success')
    } catch (error) {
      toast.show('Failed to unblock user', 'error')
    }
  }

  // Schedule a message for a future time
  const handleScheduleMessage = async (hoursFromNow) => {
    if (!text.trim() || scheduling) return
    if (isBlockedState) {
      toast.show('You cannot message a blocked user', 'warning')
      return
    }
    setScheduling(true)
    try {
      const scheduledAt = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000)
      await scheduleMessage(channel.id, text.trim(), scheduledAt, null, replyTo?.id)
      setText('')
      setReplyTo(null)
      setShowSchedule(false)
      toast.show(`Scheduled for ${scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 'success')
    } catch (error) {
      toast.show(error.message || 'Failed to schedule', 'error')
    } finally {
      setScheduling(false)
    }
  }

  // Check for scheduled messages every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      processScheduledMessages()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // ── Smart Reply: Trigger when new messages arrive from others ─
  const prevMsgLength = useRef(0)
  useEffect(() => {
    if (messages.length === 0) return
    const lastMsg = messages[messages.length - 1]
    // Only suggest replies if the last message is from someone else
    if (lastMsg.sender_id !== user.id && messages.length > prevMsgLength.current) {
      fetchSmartReplies()
    }
    prevMsgLength.current = messages.length
  }, [messages.length])

  const fetchSmartReplies = async () => {
    if (fetchingReplies || !user) return
    setFetchingReplies(true)
    try {
      const last3 = messages.slice(-3).map((m) => ({
        role: m.sender_id === user.id ? 'user' : 'other',
        content: m.content || (m.file_url ? '[Sent a file]' : ''),
      })).filter((m) => m.content)

      if (last3.length === 0) { setFetchingReplies(false); return }

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setFetchingReplies(false); return }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      if (!supabaseUrl) { setFetchingReplies(false); return }

      const res = await fetch(`${supabaseUrl}/functions/v1/smart-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ contextMessages: last3 }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.suggestions && data.suggestions.length > 0) {
          setSmartReplies(data.suggestions)
        }
      }
    } catch (error) {
      console.error('Smart reply error:', error)
    } finally {
      setFetchingReplies(false)
    }
  }

  // ── Fetch voice note transcripts ──────────────────
  useEffect(() => {
    const fetchTranscripts = async () => {
      const voiceMsgs = messages.filter(
        (m) => m.file_url && m.file_url.match(/\.(m4a|mp3|wav|ogg|aac)/i)
      )
      if (voiceMsgs.length === 0) return

      const msgIds = voiceMsgs.map((m) => m.id)
      const { data } = await supabase
        .from('voice_note_transcripts')
        .select('message_id, transcript')
        .in('message_id', msgIds)

      if (data) {
        const tMap = {}
        data.forEach((t) => { tMap[t.message_id] = t.transcript })
        setTranscripts((prev) => ({ ...prev, ...tMap }))
      }
    }
    fetchTranscripts()
  }, [messages])

  const handleSend = async () => {
    if (!text.trim() || sending) return
    if (isBlockedState) {
      toast.show('You cannot message a blocked user', 'warning')
      return
    }
    setSending(true)
    try {
      await sendMessage(channel.id, text.trim(), null, replyTo?.id)
      setText('')
      setReplyTo(null)
      setSmartReplies([]) // Hide smart replies when user types
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
    } catch (error) {
      toast.show(error.message || 'Failed to send', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleImagePick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    })
    if (result.canceled) return
    await sendFileMessage(result.assets[0])
  }

  const handleDocumentPick = async () => {
    const result = await DocumentPicker.getDocumentAsync()
    if (result.canceled) return
    await sendFileMessage(result.assets[0])
  }

  const sendFileMessage = async (asset) => {
    setSending(true)
    try {
      const publicUrl = await uploadFile(asset.uri, asset.fileName || 'file')
      await sendMessage(channel.id, asset.fileName || 'File', publicUrl, replyTo?.id)
      setReplyTo(null)
    } catch (error) {
      toast.show(error.message || 'Upload failed', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleVoiceRecordingComplete = async (uri) => {
    setSending(true)
    try {
      const publicUrl = await uploadFile(uri, `voice-${Date.now()}.m4a`)
      await sendMessage(channel.id, '🎤 Voice note', publicUrl, replyTo?.id)
      setReplyTo(null)
    } catch (error) {
      toast.show(error.message || 'Upload failed', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleEdit = () => {
    const msg = selectedMessage
    if (!msg) return
    setEditText(msg.content || '')
    setShowEditModal(true)
    setShowActions(false)
  }

  const handleEditSubmit = async () => {
    if (!editText.trim() || !selectedMessage) return
    try {
      await editMessage(selectedMessage.id, editText.trim())
      setShowEditModal(false)
      setEditText('')
    } catch (error) {
      toast.show(error.message || 'Edit failed', 'error')
    }
  }

  const handleDelete = async () => {
    const msg = selectedMessage
    if (!msg) return
    Alert.alert('Delete Message', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMessage(msg.id)
          setShowActions(false)
        },
      },
    ])
  }

  const handleLongPress = (msg) => {
    setSelectedMessage(msg)
    setShowActions(true)
  }

  const handleForward = async () => {
    const msg = selectedMessage
    if (!msg) return
    setShowActions(false)

    // Fetch all channels the user can forward to
    const { data: channels } = await supabase
      .from('channel_members')
      .select('channel_id, channels!inner(id, name, channel_type)')
      .eq('user_id', user.id)
      .neq('channel_id', channel.id) // Exclude current channel
      .in('channels.channel_type', ['dm', 'group'])

    if (channels) {
      const unique = {}
      channels.forEach((c) => {
        if (c.channels && !unique[c.channel_id]) {
          unique[c.channel_id] = c.channels
        }
      })
      const list = Object.values(unique).sort((a, b) => a.name?.localeCompare(b.name))

      // Fetch display names for DM channels
      const enriched = await Promise.all(list.map(async (ch) => {
        if (ch.channel_type === 'dm') {
          const { data: member } = await supabase
            .from('channel_members')
            .select('user:user_id(display_name)')
            .eq('channel_id', ch.id)
            .neq('user_id', user.id)
            .maybeSingle()
          return { ...ch, displayName: member?.user?.display_name || ch.name }
        }
        return { ...ch, displayName: ch.name }
      }))

      setForwardChannels(enriched)
      setShowForwardPicker(true)
    }
  }

  const handleForwardSubmit = async (targetChannel) => {
    const msg = selectedMessage
    if (!msg) return
    setForwarding(true)

    const forwardedContent = msg.content
      ? `📨 Forwarded: ${msg.content}`
      : msg.file_url
        ? '📨 Forwarded: 📎 File'
        : '📨 Forwarded message'

    try {
      await sendMessage(targetChannel.id, forwardedContent, msg.file_url || null)
      toast.show('Message forwarded!', 'success')
      setShowForwardPicker(false)
      setSelectedMessage(null)
    } catch (error) {
      toast.show(error.message || 'Forward failed', 'error')
    } finally {
      setForwarding(false)
    }
  }

  const handleReact = async (emoji) => {
    if (!selectedMessage) return
    await addReaction(selectedMessage.id, emoji)
    setShowReactions(false)
    setShowActions(false)
  }

  const startCall = async (callType) => {
    if (!otherUserInfo.id) {
      toast.show('Cannot initiate call — no other user found', 'error')
      return
    }
    try {
      const { error } = await supabase.from('calls').insert({
        channel_id: channel.id,
        caller_id: user.id,
        receiver_id: otherUserInfo.id,
        call_type: callType,
        status: 'outgoing',
      })
      if (error) throw error
      toast.show(`${callType === 'audio' ? 'Audio' : 'Video'} call started!`, 'success')
    } catch (error) {
      toast.show(error.message || 'Call failed', 'error')
    }
  }

  const handleExportChat = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      const allMessages = messagesByChannel[channel.id] || []
      if (allMessages.length === 0) {
        toast.show('No messages to export', 'info')
        return
      }

      const lines = allMessages.map((msg) => {
        const sender = msg.sender?.display_name || msg.sender_id?.slice(0, 8) || 'Unknown'
        const date = new Date(msg.created_at).toLocaleString()
        let content = msg.content || ''
        if (msg.file_url) {
          if (msg.file_url.match(/\.(jpg|jpeg|png|gif|webp)/i)) content = '[Image]'
          else if (msg.file_url.match(/\.(m4a|mp3|wav|ogg|aac)/i)) content = '[Voice Note]'
          else content = '[File]'
        }
        return `[${date}] ${sender}: ${content}`
      })

      const text = lines.join('\n')
      await Share.share({
        message: text,
        title: `Chat Export — ${channel.name || 'Conversation'}`,
      })
    } catch (error) {
      if (error.message !== 'User did not share') {
        toast.show('Export failed', 'error')
      }
    } finally {
      setExporting(false)
    }
  }, [channel.id, channel.name, messagesByChannel])

  // Build a map of message ID -> message for quick lookup
  const messageMap = useMemo(() => {
    const map = {}
    messages.forEach((m) => { map[m.id] = m })
    return map
  }, [messages])

  // Build reply count per message
  const replyCounts = useMemo(() => {
    const counts = {}
    messages.forEach((m) => {
      if (m.reply_to_id) {
        counts[m.reply_to_id] = (counts[m.reply_to_id] || 0) + 1
      }
    })
    return counts
  }, [messages])

  // Build map of reply_to_id -> array of reply messages
  const messagesByReplyToId = useMemo(() => {
    const map = {}
    messages.forEach((m) => {
      if (m.reply_to_id) {
        if (!map[m.reply_to_id]) map[m.reply_to_id] = []
        map[m.reply_to_id].push(m)
      }
    })
    return map
  }, [messages])

  const [expandedThread, setExpandedThread] = useState(null)

  const scrollToMessage = (messageId) => {
    const index = messages.findIndex((m) => m.id === messageId)
    if (index >= 0) {
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 })
    }
  }

  const styles = useMemo(() => makeStyles(colors), [colors])

  const formatTime = (dateStr) => {
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  const renderMessageContent = (item, isMine) => {
    // Audio file (voice note)
    if (item.file_url && item.file_url.match(/\.(m4a|mp3|wav|ogg|aac)/i)) {
      const hasTranscript = !!transcripts[item.id]
      const isExpanded = expandedTranscripts[item.id]
      return (
        <View>
          <View style={styles.voiceNote}>
            <Ionicons name="mic" size={20} color="#fff" />
            <View style={styles.waveform}>
              {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((h, i) => (
                <View
                  key={i}
                  style={[styles.waveformBar, { height: h * 4 }]}
                />
              ))}
            </View>
            <Text style={styles.voiceDuration}>0:05</Text>
          </View>
          {hasTranscript && (
            <TouchableOpacity
              style={styles.transcriptToggle}
              onPress={() => setExpandedTranscripts((prev) => ({
                ...prev,
                [item.id]: !prev[item.id],
              }))}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={12}
                color={colors.textMuted}
              />
              <Text style={styles.transcriptToggleText}>
                {isExpanded ? 'Hide transcript' : 'View transcript'}
              </Text>
            </TouchableOpacity>
          )}
          {hasTranscript && isExpanded && (
            <View style={styles.transcriptContainer}>
              <Text style={styles.transcriptText}>{transcripts[item.id]}</Text>
            </View>
          )}
        </View>
      )
    }

    // Image file
    if (item.file_url && item.file_url.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
      return (
        <TouchableOpacity onPress={() => setLightboxImage(item.file_url)} activeOpacity={0.9}>
          <Image
            source={{ uri: item.file_url }}
            style={styles.messageImage}
            resizeMode="cover"
          />
        </TouchableOpacity>
      )
    }

    // Other file type
    if (item.file_url) {
      return (
        <View style={styles.fileAttachment}>            <Ionicons name="document-attach" size={24} color={colors.primary} />
          <Text style={styles.fileName}>{item.content || 'File'}</Text>
        </View>
      )
    }

    // Scheduled message indicator
    if (item.scheduled_at) {
      const schedTime = new Date(item.scheduled_at)
      const isBefore = schedTime > new Date()
      return (
        <View style={styles.scheduledMsg}>
          <Ionicons name="time-outline" size={14} color={colors.warning} />
          <Text style={[styles.messageText, isMine && styles.myMessageText]}>
            {item.content}
          </Text>
          <Text style={styles.scheduledBadge}>
            {isBefore ? `Scheduled ${formatTime(item.scheduled_at)}` : 'Sending...'}
          </Text>
        </View>
      )
    }

    // Plain text message
    if (item.content) {
      return (
        <Text style={[styles.messageText, isMine && styles.myMessageText]}>
          {item.content}
        </Text>
      )
    }

    return null
  }

  // Render swipeable reply action
  const renderRightActions = (item) => {
    return (
      <Animated.View style={styles.swipeAction}>
        <TouchableOpacity
          style={styles.swipeActionButton}
          onPress={() => {
            setReplyTo(item)
          }}
        >
          <Ionicons name="arrow-undo" size={22} color="#fff" />
          <Text style={styles.swipeActionText}>Reply</Text>
        </TouchableOpacity>
      </Animated.View>
    )
  }

  const renderMessage = ({ item }) => {
    const isMine = item.sender_id === user.id
    const reactions = item.reactions || []
    const reactionSummary = {}
    reactions.forEach((r) => {
      reactionSummary[r.emoji] = (reactionSummary[r.emoji] || 0) + 1
    })

    // Check read status
    const readStatusMap = readStatusByChannel[channel.id] || {}
    let isRead = false
    if (isMine) {
      // For DMs: check if the other user has read this message
      // For groups: check if at least one other member has read it
      if (channel.channel_type === 'dm' && otherUserInfo.id) {
        const otherLastRead = readStatusMap[otherUserInfo.id]
        if (otherLastRead) {
          isRead = item.id <= otherLastRead
        }
      } else if (channel.channel_type === 'group' || channel.channel_type === 'broadcast') {
        // Check if any other member has read it
        isRead = Object.entries(readStatusMap)
          .filter(([uid]) => uid !== user.id)
          .some(([, lastReadId]) => lastReadId && item.id <= lastReadId)
      }
    }

      // Find the original replied-to message
    const repliedToMsg = item.reply_to_id ? messageMap[item.reply_to_id] : null
    const replyCount = replyCounts[item.id] || 0
    const isThreadExpanded = expandedThread === item.id

    const messageContent = (
      <TouchableOpacity
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
        activeOpacity={0.7}
        onPress={() => {
          // If message has replies and not currently expanded, expand thread
          if (replyCount > 0 && !isThreadExpanded) {
            setExpandedThread(item.id)
          } else if (isThreadExpanded) {
            setExpandedThread(null)
          }
        }}
      >
        <View style={[styles.messageRow, isMine && styles.myMessageRow]}>
          <View style={[styles.messageBubble, isMine ? styles.myBubble : styles.theirBubble]}>
            {item.reply_to_id && repliedToMsg && (
              <TouchableOpacity
                style={styles.replyPreview}
                onPress={() => scrollToMessage(item.reply_to_id)}
                activeOpacity={0.7}
              >
                <Text style={styles.replyPreviewSender} numberOfLines={1}>
                  {repliedToMsg.sender?.display_name || 'Someone'}
                </Text>
                <Text style={styles.replyPreviewText} numberOfLines={1}>
                  {repliedToMsg.content || (repliedToMsg.file_url ? '📎 File' : '')}
                </Text>
              </TouchableOpacity>
            )}
            {renderMessageContent(item, isMine)}
            {Object.keys(reactionSummary).length > 0 && (
              <View style={styles.reactionBar}>
                {Object.entries(reactionSummary).map(([emoji, count]) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.reactionPill}
                    onPress={() => {
                      const userReacted = reactions.some(
                        (r) => r.emoji === emoji && r.user_id === user.id
                      )
                      if (userReacted) {
                        removeReaction(item.id, emoji)
                      } else {
                        addReaction(item.id, emoji)
                      }
                    }}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                    <Text style={styles.reactionCount}>{count}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={[styles.messageTimeRow, isMine && styles.myMessageTimeRow]}>
              <Text style={[styles.messageTime, isMine && styles.myMessageTime]}>
                {formatTime(item.created_at)}
                {item.edited_at && ' (edited)'}
              </Text>
              {isMine && (
                <Ionicons
                  name={isRead ? 'checkmark-done' : 'checkmark'}
                  size={14}
                  color={isRead ? '#53bdeb' : colors.textDisabled}
                  style={styles.readReceiptIcon}
                />
              )}
            </View>
            {replyCount > 0 && (
              <TouchableOpacity
                style={styles.threadBadge}
                onPress={() => {
                  if (isThreadExpanded) setExpandedThread(null)
                  else setExpandedThread(item.id)
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-down" size={12} color={colors.primary} />
                <Text style={styles.threadBadgeText}>
                  {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    )

    // Replies to this message (for inline thread view)
    const threadReplies = isThreadExpanded ? (messagesByReplyToId[item.id] || []) : []

    const renderThreadReply = (reply, index) => {
      const isReplyMine = reply.sender_id === user.id
      return (
        <View key={reply.id} style={[styles.threadReplyRow, isReplyMine && styles.threadReplyRowMine]}>
          <View style={styles.threadReplyLine} />
          <View style={[styles.threadReplyBubble]}>
            <Text style={styles.threadReplySender} numberOfLines={1}>
              {reply.sender?.display_name || 'Someone'}
            </Text>
            <Text style={styles.threadReplyContent}>{reply.content}</Text>
            <Text style={styles.threadReplyTime}>{formatTime(reply.created_at)}</Text>
          </View>
        </View>
      )
    }

    return (
      <View>
        <Swipeable
          renderRightActions={() => renderRightActions(item)}
          overshootRight={false}
          rightThreshold={40}
        >
          {messageContent}
        </Swipeable>
        {isThreadExpanded && threadReplies.length > 0 && (
          <View style={styles.threadContainer}>
            {threadReplies.map((reply, idx) => renderThreadReply(reply, idx))}
          </View>
        )}
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Animated Header */}
      <ChatHeader
        channel={channel}
        online={false}
        onBack={() => navigation.goBack()}
        onAudioCall={() => startCall('audio')}
        onVideoCall={() => startCall('video')}
        onGroupInfo={() => navigation.navigate('GroupInfo', { channel })}
        isMuted={mutedChannels[channel.id]}
        onMuteToggle={() => toggleMute(channel.id)}
      />

      {/* Blocked banner */}
      {isBlockedState && (
        <View style={styles.blockedBanner}>
          <Ionicons name="shield-outline" size={18} color={colors.danger} />
          <Text style={styles.blockedBannerText}>You blocked {otherUserInfo.name || 'this user'}</Text>
          <TouchableOpacity onPress={handleUnblockUser}>
            <Text style={styles.unblockText}>Unblock</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: false })
        }}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.textDisabled} />
            <Text style={styles.emptyMessagesText}>No messages yet</Text>
            <Text style={styles.emptyMessagesSubtext}>Say hello!</Text>
          </View>
        }
      />

      {/* Reply Bar */}
      {replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarContent}>
            <Ionicons name="arrow-undo" size={18} color={colors.primary} />
            <Text style={styles.replyBarText} numberOfLines={1}>
              Replying to {replyTo.sender?.display_name || 'message'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Smart Reply Suggestions */}
      {smartReplies.length > 0 && !text.trim() && (
        <View style={styles.smartReplyBar}>
          <View style={styles.smartReplyLabel}>
            <Ionicons name="flash-outline" size={14} color={colors.accent} />
            <Text style={styles.smartReplyLabelText}>Suggested replies</Text>
          </View>
          <View style={styles.smartReplyChips}>
            {smartReplies.map((reply, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.smartReplyChip}
                onPress={() => {
                  setText(reply)
                  setSmartReplies([])
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.smartReplyChipText} numberOfLines={1}>{reply}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Typing Indicator */}
      {typingUserIds.size > 0 && (
        <View style={styles.typingIndicator}>
          <View style={styles.typingDots}>
            <View style={styles.typingDot} />
            <View style={styles.typingDot} />
            <View style={styles.typingDot} />
          </View>
          <Text style={styles.typingText}>
            {channel.channel_type === 'dm'
              ? `${otherUserInfo.name || 'Someone'} is typing...`
              : `${typingUserIds.size} ${typingUserIds.size === 1 ? 'person' : 'people'} typing...`}
          </Text>
        </View>
      )}

      {/* Input Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachButton} onPress={handleImagePick}>
            <Ionicons name="image-outline" size={24} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachButton} onPress={handleDocumentPick}>
            <Ionicons name="document-outline" size={24} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachButton} onPress={() => setShowSchedule(true)}>
            <Ionicons name="time-outline" size={24} color={colors.textTertiary} />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={(v) => {
              setText(v)
              handleTyping()
              if (v.trim()) setSmartReplies([]) // Hide smart replies when user starts typing
            }}
            multiline
            maxLength={1000}
          />
          {text.trim() ? (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSend}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          ) : (
            <VoiceRecorderButton onRecordingComplete={handleVoiceRecordingComplete} />
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Edit Message Modal (cross-platform) */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalContent}>
            <Text style={styles.editModalTitle}>Edit Message</Text>
            <TextInput
              style={styles.editModalInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              maxLength={1000}
              placeholder="Update your message..."
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.editModalButtons}>
              <TouchableOpacity
                style={styles.editModalCancel}
                onPress={() => {
                  setShowEditModal(false)
                  setEditText('')
                }}
              >
                <Text style={styles.editModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editModalSave}
                onPress={handleEditSubmit}
              >
                <Text style={styles.editModalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Message Actions Modal */}
      <Modal visible={showActions} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowActions(false)
            setShowReactions(false)
          }}
        >
          <View style={styles.actionSheet}>
            {!showReactions ? (
              <>
                <Text style={styles.actionTitle}>Message Actions</Text>
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => {
                    setReplyTo(selectedMessage)
                    setShowActions(false)
                  }}
                >
                  <Ionicons name="arrow-undo" size={22} color="#fff" />
                  <Text style={styles.actionText}>Reply</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => {
                    setShowActions(false)
                    handleExportChat()
                  }}
                >
                  {exporting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="download-outline" size={22} color="#fff" />
                  )}
                  <Text style={styles.actionText}>{exporting ? 'Exporting...' : 'Export Chat'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => setShowReactions(true)}
                >
                  <Ionicons name="happy-outline" size={22} color="#fff" />
                  <Text style={styles.actionText}>React</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={handleForward}
                >
                  <Ionicons name="arrow-forward" size={22} color="#fff" />
                  <Text style={styles.actionText}>Forward</Text>
                </TouchableOpacity>
                {selectedMessage?.sender_id === user.id && (
                  <>
                    <TouchableOpacity style={styles.actionItem} onPress={handleEdit}>
                      <Ionicons name="create-outline" size={22} color="#fff" />
                      <Text style={styles.actionText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionItem} onPress={handleDelete}>
                      <Ionicons name="trash-outline" size={22} color="#ff4757" />
                      <Text style={[styles.actionText, { color: '#ff4757' }]}>Delete</Text>
                    </TouchableOpacity>
                  </>
                )}
                {/* Block user option on their messages */}
                {selectedMessage?.sender_id !== user.id && channel.channel_type === 'dm' && (
                  <TouchableOpacity style={styles.actionItem} onPress={isBlockedState ? handleUnblockUser : handleBlockUser}>
                    <Ionicons
                      name={isBlockedState ? 'shield-checkmark-outline' : 'shield-outline'}
                      size={22}
                      color={isBlockedState ? colors.accent : colors.danger}
                    />
                    <Text style={[styles.actionText, { color: isBlockedState ? colors.accent : colors.danger }]}>
                      {isBlockedState ? 'Unblock User' : 'Block User'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.cancelAction}
                  onPress={() => setShowActions(false)}
                >
                  <Text style={styles.cancelActionText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.actionTitle}>Choose Reaction</Text>
                <View style={styles.emojiGrid}>
                  {EMOJI_LIST.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={styles.emojiButton}
                      onPress={() => handleReact(emoji)}
                    >
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.cancelAction}
                  onPress={() => setShowReactions(false)}
                >
                  <Text style={styles.cancelActionText}>Back</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Forward Message - Channel Picker */}
      <Modal visible={showForwardPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.forwardSheet}>
            <View style={styles.forwardHeader}>
              <Text style={styles.forwardTitle}>Forward to...</Text>
              <TouchableOpacity onPress={() => { setShowForwardPicker(false); setSelectedMessage(null) }}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {forwardChannels.length === 0 ? (
              <View style={styles.forwardEmpty}>
                <Ionicons name="chatbubbles-outline" size={40} color={colors.textDisabled} />
                <Text style={styles.forwardEmptyText}>No other chats to forward to</Text>
              </View>
            ) : (
              <FlatList
                data={forwardChannels}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.forwardItem}
                    onPress={() => handleForwardSubmit(item)}
                    disabled={forwarding}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.forwardIcon, {
                      backgroundColor: item.channel_type === 'dm' ? `${colors.primary}20` : `${colors.accent}20`,
                    }]}>
                      <Ionicons
                        name={item.channel_type === 'dm' ? 'person' : 'people'}
                        size={20}
                        color={item.channel_type === 'dm' ? colors.primary : colors.accent}
                      />
                    </View>
                    <Text style={styles.forwardItemName} numberOfLines={1}>
                      {item.displayName}
                    </Text>
                    {forwarding && <ActivityIndicator size="small" color={colors.primary} />}
                  </TouchableOpacity>
                )}
                style={{ maxHeight: 300 }}
              />
            )}
            <TouchableOpacity style={styles.forwardCancel} onPress={() => { setShowForwardPicker(false); setSelectedMessage(null) }}>
              <Text style={styles.forwardCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Schedule Message Modal */}
      <Modal visible={showSchedule} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSchedule(false)}
        >
          <View style={[styles.actionSheet, { paddingBottom: 40 }]}>
            <Text style={styles.actionTitle}>Schedule Message</Text>
            {getScheduleOptions().map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={styles.actionItem}
                onPress={() => handleScheduleMessage(opt.hours)}
                disabled={scheduling}
              >
                <Ionicons name={opt.icon} size={22} color={colors.primary} />
                <Text style={styles.actionText}>{opt.label}</Text>
                {scheduling && <ActivityIndicator size="small" color={colors.primary} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.cancelAction}
              onPress={() => setShowSchedule(false)}
            >
              <Text style={styles.cancelActionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Image Lightbox */}
      <Modal visible={!!lightboxImage} transparent animationType="fade" onRequestClose={() => setLightboxImage(null)}>
        <TouchableOpacity
          style={styles.lightboxOverlay}
          activeOpacity={1}
          onPress={() => setLightboxImage(null)}
        >
          {lightboxImage && (
            <Image
              source={{ uri: lightboxImage }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxImage(null)}>
            <Ionicons name="close-circle" size={32} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexGrow: 1,
  },
  messageRow: {
    marginVertical: 3,
    alignItems: 'flex-start',
  },
  myMessageRow: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  myBubble: {
    backgroundColor: colors.bubble.mine,
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: colors.bubble.theirs,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    color: colors.bubble.theirsText,
    fontSize: 15,
    lineHeight: 20,
  },
  myMessageText: {
    color: colors.bubble.mineText,
  },
  messageTime: {
    color: colors.bubble.theirsTime,
    fontSize: 11,
  },
  myMessageTime: {
    color: colors.bubble.mineTime,
  },
  messageTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 3,
  },
  myMessageTimeRow: {
  },
  readReceiptIcon: {
    marginTop: 1,
  },
  replyPreview: {
    backgroundColor: colors.bubble.theirs.replace ? colors.bubble.theirs + '20' : 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  replyPreviewSender: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  replyPreviewText: {
    color: '#aaa',
    fontSize: 12,
  },
  threadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  threadBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  threadContainer: {
    marginTop: 2,
    marginBottom: 4,
  },
  threadReplyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 16,
    marginVertical: 2,
  },
  threadReplyRowMine: {
    justifyContent: 'flex-end',
    paddingRight: 16,
    paddingLeft: 0,
  },
  threadReplyLine: {
    width: 2,
    backgroundColor: `${colors.primary}30`,
    marginRight: 10,
    alignSelf: 'stretch',
    minHeight: 30,
    borderRadius: 1,
  },
  threadReplyBubble: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '75%',
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  threadReplySender: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  threadReplyContent: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  threadReplyTime: {
    color: colors.textDisabled,
    fontSize: 10,
    marginTop: 2,
    alignSelf: 'flex-end',
  },
  reactionBar: {
    flexDirection: 'row',
    marginTop: 6,
    flexWrap: 'wrap',
    gap: 4,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bubble.theirs.replace ? colors.bubble.theirs + '20' : 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    color: '#aaa',
    fontSize: 12,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginVertical: 4,
  },
  fileAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  fileName: {
    color: colors.primary,
    fontSize: 14,
    flex: 1,
  },
  // ── Scheduled Messages ────────────────────────────────
  scheduledMsg: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  scheduledBadge: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '500',
    backgroundColor: `${colors.warning}15`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  voiceNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  waveformBar: {
    width: 3,
    backgroundColor: '#fff',
    borderRadius: 2,
    opacity: 0.6,
  },
  voiceDuration: {
    color: '#aaa',
    fontSize: 12,
  },
  emptyMessages: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyMessagesText: {
    color: colors.textMuted,
    fontSize: 16,
    marginTop: 12,
  },
  emptyMessagesSubtext: {
    color: colors.textDisabled,
    fontSize: 14,
    marginTop: 4,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  replyBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replyBarText: {
    color: colors.textTertiary,
    fontSize: 13,
    flex: 1,
  },

  // ── Smart Reply Suggestions ───────────────────────────
  smartReplyBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  smartReplyLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  smartReplyLabelText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  smartReplyChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  smartReplyChip: {
    backgroundColor: `${colors.primary}15`,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
  },
  smartReplyChipText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '500',
    maxWidth: 160,
  },

  // ── Transcript UI ──────────────────────────────────────
  transcriptToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  transcriptToggleText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  transcriptContainer: {
    backgroundColor: `${colors.bg}80`,
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  transcriptText: {
    color: colors.textTertiary,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
  },

  // ── Blocked Banner ───────────────────────────────
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.danger}15`,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  blockedBannerText: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  unblockText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Typing Indicator ────────────────────────────────
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    gap: 8,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    opacity: 0.6,
  },
  typingText: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    gap: 4,
  },
  attachButton: {
    padding: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  editModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  editModalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  editModalTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  editModalInput: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 80,
    maxHeight: 160,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: 'top',
  },
  editModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  editModalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceHover,
  },
  editModalCancelText: {
    color: colors.textTertiary,
    fontSize: 15,
    fontWeight: '500',
  },
  editModalSave: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  editModalSaveText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlayLight,
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  actionTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  actionText: {
    color: colors.textPrimary,
    fontSize: 16,
  },
  cancelAction: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelActionText: {
    color: colors.textTertiary,
    fontSize: 16,
  },
  emojiGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 16,
  },
  emojiButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceHover,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiText: {
    fontSize: 28,
  },

  // ── Forward Message ────────────────────────────────
  forwardSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  forwardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  forwardTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  forwardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  forwardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  forwardItemName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  forwardCancel: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  forwardCancelText: {
    color: colors.textTertiary,
    fontSize: 16,
  },
  forwardEmpty: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  forwardEmptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },

  // ── Swipe to Reply ───────────────────────────────
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  swipeActionButton: {
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    height: '100%',
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    marginVertical: 3,
  },
  swipeActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },

  // ── Image Lightbox ────────────────────────────────
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '80%',
  },
  lightboxClose: {
    position: 'absolute',
    top: 60,
    right: 20,
  },
})
