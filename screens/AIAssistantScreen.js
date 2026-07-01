import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, SafeAreaView,
  Animated,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore, useAIStore } from '../lib/store'
import { useColors } from '../lib/theme'
import Avatar from '../components/Avatar'

const AI_CONTACT = {
  id: 'ai-assistant',
  display_name: 'AI Assistant',
  username: 'ai',
}

export default function AIAssistantScreen({ navigation }) {
  const colors = useColors()
  const user = useAuthStore((s) => s.user)
  const {
    conversations,
    loading,
    sending,
    fetchConversations,
    sendToAI,
    clearConversation,
  } = useAIStore()

  const [text, setText] = useState('')
  const flatListRef = useRef(null)
  const typingAnim = useRef(new Animated.Value(0)).current

  // ── Load conversation history on mount ────────────────────
  useEffect(() => {
    fetchConversations()
  }, [])

  // ── Typing indicator animation ────────────────────────────
  useEffect(() => {
    if (sending) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(typingAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(typingAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      )
      pulse.start()
      return () => pulse.stop()
    } else {
      typingAnim.setValue(0)
    }
  }, [sending])

  const handleSend = async () => {
    if (!text.trim() || sending) return
    const msg = text.trim()
    setText('')
    try {
      await sendToAI(msg)
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200)
    } catch (error) {
      // Error is handled in the store
    }
  }

  const handleClear = () => {
    clearConversation()
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

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user'

    return (
      <View style={[styles.messageRow, isUser && styles.myMessageRow]}>
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Avatar name={AI_CONTACT.display_name} size="sm" />
          </View>
        )}
        <View style={[styles.messageBubble, isUser ? styles.myBubble : styles.theirBubble]}>
          <Text style={[styles.messageText, isUser && styles.myMessageText]}>
            {item.content}
          </Text>
          <View style={[styles.messageTimeRow, isUser && styles.myMessageTimeRow]}>
            <Text style={[styles.messageTime, isUser && styles.myMessageTime]}>
              {formatTime(item.created_at)}
            </Text>
          </View>
        </View>
      </View>
    )
  }

  const styles = useMemo(() => makeStyles(colors), [colors])

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.avatarContainer}>
          <Avatar name={AI_CONTACT.display_name} size="sm" />
        </View>
        <View style={styles.headerTitle}>
          <Text style={styles.headerName} numberOfLines={1}>{AI_CONTACT.display_name}</Text>
          <Text style={styles.headerStatus}>Claude Haiku · Online</Text>
        </View>
        <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
          <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => {
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100)
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyMessages}>
              <Ionicons name="sparkles-outline" size={64} color={colors.textDisabled} />
              <Text style={styles.emptyTitle}>AI Assistant</Text>
              <Text style={styles.emptyText}>
                Ask me anything! I can help with writing, coding, research, and more.
              </Text>
              <View style={styles.suggestionChips}>
                {[
                  'Help me write a message',
                  'What is React Native?',
                  'Explain how Supabase works',
                ].map((suggestion, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.suggestionChip}
                    onPress={() => {
                      setText(suggestion)
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.suggestionChipText}>{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )
        }
      />

      {/* Typing Indicator */}
      {sending && (
        <View style={styles.typingIndicator}>
          <Animated.View style={[styles.typingDot, { opacity: typingAnim }]} />
          <Animated.View style={[styles.typingDot, { opacity: typingAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.8] }) }]} />
          <Animated.View style={[styles.typingDot, { opacity: typingAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0.4] }) }]} />
          <Text style={styles.typingText}>AI is thinking...</Text>
        </View>
      )}

      {/* Input Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask anything..."
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={10000}
            editable={!sending}
          />
          {text.trim() ? (
            <TouchableOpacity
              style={[styles.sendButton, sending && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    marginLeft: 4,
  },
  headerTitle: {
    flex: 1,
    marginLeft: 10,
  },
  headerName: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  headerStatus: {
    color: colors.accent,
    fontSize: 12,
    marginTop: 1,
  },
  clearButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexGrow: 1,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 3,
    alignItems: 'flex-end',
  },
  myMessageRow: {
    justifyContent: 'flex-end',
  },
  aiAvatar: {
    marginRight: 8,
    marginBottom: 4,
  },
  messageBubble: {
    maxWidth: '75%',
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
  myMessageTimeRow: {},
  emptyMessages: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    color: colors.textTertiary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  suggestionChips: {
    gap: 8,
    width: '100%',
  },
  suggestionChip: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionChipText: {
    color: colors.primary,
    fontSize: 14,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  typingText: {
    color: colors.textMuted,
    fontSize: 13,
    marginLeft: 6,
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
  sendButtonDisabled: {
    opacity: 0.5,
  },
})
