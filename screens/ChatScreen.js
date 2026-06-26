import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
  ActivityIndicator, Image, Modal, SafeAreaView,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { useAudioRecorder, requestRecordingPermissionsAsync, setAudioModeAsync, RecordingPresets } from 'expo-audio'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore, useMessagesStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { colors } from '../lib/theme'
import ChatHeader from '../components/ChatHeader'
import { useToast } from '../components/Toast'

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export default function ChatScreen({ route, navigation }) {
  const { channel } = route.params
  const user = useAuthStore((s) => s.user)
  const {
    messagesByChannel, fetchMessages, subscribeToChannel, unsubscribeFromChannel,
    sendMessage, editMessage, deleteMessage, addReaction, removeReaction, uploadFile,
    fetchReadStatus, subscribeToReadStatus, unsubscribeFromReadStatus, markChannelAsRead,
    readStatusByChannel,
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
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)

  const messages = messagesByChannel[channel.id] || []
  const flatListRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const typingChannelRef = useRef(null)
  const typingTimersRef = useRef({})
  const [typingUserIds, setTypingUserIds] = useState(new Set())
  const [otherUserInfo, setOtherUserInfo] = useState({ id: null, name: '' })

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

  const handleSend = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await sendMessage(channel.id, text.trim(), null, replyTo?.id)
      setText('')
      setReplyTo(null)
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

  const startRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync()
      if (!granted) {
        toast.show('Microphone access is required for voice notes', 'warning')
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
    }
  }

  const stopRecording = async () => {
    if (!recorder.isRecording) return
    setIsRecording(false)
    setSending(true)
    try {
      await recorder.stop()
      const uri = recorder.uri

      if (!uri) {
        toast.show('Failed to get recording', 'error')
        return
      }

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
      return (
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
      )
    }

    // Image file
    if (item.file_url && item.file_url.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
      return (
        <Image
          source={{ uri: item.file_url }}
          style={styles.messageImage}
          resizeMode="cover"
        />
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

    return (
      <TouchableOpacity
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
        activeOpacity={0.7}
      >
        <View style={[styles.messageRow, isMine && styles.myMessageRow]}>
          <View style={[styles.messageBubble, isMine ? styles.myBubble : styles.theirBubble]}>
            {item.reply_to_id && (
              <View style={styles.replyPreview}>
                <Text style={styles.replyPreviewText}>
                  Replying to a message
                </Text>
              </View>
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
          </View>
        </View>
      </TouchableOpacity>
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
      />

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
          <TextInput
            style={styles.textInput}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={(v) => {
              setText(v)
              handleTyping()
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
            <TouchableOpacity
              style={[styles.sendButton, isRecording && styles.recordingButton]}
              onPressIn={startRecording}
              onPressOut={stopRecording}
            >
              <Ionicons
                name={isRecording ? 'mic' : 'mic-outline'}
                size={22}
                color="#fff"
              />
            </TouchableOpacity>
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
                  onPress={() => setShowReactions(true)}
                >
                  <Ionicons name="happy-outline" size={22} color="#fff" />
                  <Text style={styles.actionText}>React</Text>
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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
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
  replyPreviewText: {
    color: '#aaa',
    fontSize: 12,
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
  recordingButton: {
    backgroundColor: colors.danger,
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
})
