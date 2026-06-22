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

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export default function ChatScreen({ route, navigation }) {
  const { channel } = route.params
  const user = useAuthStore((s) => s.user)
  const {
    messagesByChannel, fetchMessages, subscribeToChannel, unsubscribeFromChannel,
    sendMessage, editMessage, deleteMessage, addReaction, removeReaction, uploadFile,
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

  useEffect(() => {
    fetchMessages(channel.id)
    subscribeToChannel(channel.id)

    // Typing indicator channel
    typingChannelRef.current = supabase.channel(`typing:${channel.id}`, {
      config: { broadcast: { self: true } },
    })
    typingChannelRef.current.subscribe()

    return () => {
      unsubscribeFromChannel(channel.id)
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
      Alert.alert('Error', error.message)
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
      Alert.alert('Upload Error', error.message)
    } finally {
      setSending(false)
    }
  }

  const startRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync()
      if (!granted) {
        Alert.alert('Permission needed', 'Microphone access is required for voice notes')
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
      Alert.alert('Recording Error', error.message)
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
        Alert.alert('Error', 'Failed to get recording')
        return
      }

      const publicUrl = await uploadFile(uri, `voice-${Date.now()}.m4a`)
      await sendMessage(channel.id, '🎤 Voice note', publicUrl, replyTo?.id)
      setReplyTo(null)
    } catch (error) {
      Alert.alert('Upload Error', error.message)
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
      Alert.alert('Edit Error', error.message)
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
        <View style={styles.fileAttachment}>
          <Ionicons name="document-attach" size={24} color="#6c63ff" />
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
            <Text style={[styles.messageTime, isMine && styles.myMessageTime]}>
              {formatTime(item.created_at)}
              {item.edited_at && ' (edited)'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{channel.name}</Text>
          <Text style={styles.headerSubtitle}>
            {channel.channel_type === 'group' ? 'Group' : 'Direct Message'}
          </Text>
        </View>
        {channel.is_group && (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('GroupInfo', { channel })}
          >
            <Ionicons name="people-outline" size={24} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

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
            <Ionicons name="chatbubbles-outline" size={48} color="#444" />
            <Text style={styles.emptyMessagesText}>No messages yet</Text>
            <Text style={styles.emptyMessagesSubtext}>Say hello!</Text>
          </View>
        }
      />

      {/* Reply Bar */}
      {replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarContent}>
            <Ionicons name="arrow-undo" size={18} color="#6c63ff" />
            <Text style={styles.replyBarText} numberOfLines={1}>
              Replying to {replyTo.sender?.display_name || 'message'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Ionicons name="close-circle" size={22} color="#666" />
          </TouchableOpacity>
        </View>
      )}

      {/* Input Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachButton} onPress={handleImagePick}>
            <Ionicons name="image-outline" size={24} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachButton} onPress={handleDocumentPick}>
            <Ionicons name="document-outline" size={24} color="#888" />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            placeholder="Message..."
            placeholderTextColor="#666"
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
              placeholderTextColor="#666"
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
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2a4a',
  },
  backButton: {
    padding: 4,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  headerButton: {
    padding: 8,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
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
    backgroundColor: '#6c63ff',
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: '#2a2a4a',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    color: '#e0e0e0',
    fontSize: 15,
    lineHeight: 20,
  },
  myMessageText: {
    color: '#fff',
  },
  messageTime: {
    color: '#888',
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  myMessageTime: {
    color: 'rgba(255,255,255,0.6)',
  },
  replyPreview: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#6c63ff',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    color: '#6c63ff',
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
    color: '#555',
    fontSize: 16,
    marginTop: 12,
  },
  emptyMessagesSubtext: {
    color: '#444',
    fontSize: 14,
    marginTop: 4,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#2a2a4a',
  },
  replyBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replyBarText: {
    color: '#aaa',
    fontSize: 13,
    flex: 1,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#16213e',
    borderTopWidth: 0.5,
    borderTopColor: '#2a2a4a',
    gap: 4,
  },
  attachButton: {
    padding: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fff',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6c63ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingButton: {
    backgroundColor: '#ff4757',
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  editModalContent: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  editModalTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  editModalInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#fff',
    minHeight: 80,
    maxHeight: 160,
    borderWidth: 1,
    borderColor: '#2a2a4a',
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
    backgroundColor: '#2a2a4a',
  },
  editModalCancelText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '500',
  },
  editModalSave: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#6c63ff',
  },
  editModalSaveText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: '#16213e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  actionTitle: {
    color: '#fff',
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
    borderBottomColor: '#2a2a4a',
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
  },
  cancelAction: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelActionText: {
    color: '#888',
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
    backgroundColor: '#2a2a4a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiText: {
    fontSize: 28,
  },
})
