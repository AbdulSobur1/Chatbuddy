import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, shadows } from '../lib/theme'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error(`ErrorBoundary [${this.props.name || 'unknown'}]:`, error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.iconWrap}>
            <Ionicons name="bug-outline" size={48} color={colors.danger} />
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            {this.props.name
              ? `An error occurred in ${this.props.name}.`
              : 'An unexpected error occurred.'}
          </Text>
          <Text style={styles.hint}>You can try again or restart the app.</Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry} activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
          {__DEV__ && this.state.error && (
            <View style={styles.devBox}>
              <Text style={styles.devLabel}>DEV: {this.state.error?.message}</Text>
            </View>
          )}
        </View>
      )
    }

    return this.props.children
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: `${colors.danger}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.textTertiary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 4,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 28,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: radius.full,
    ...shadows.md,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  devBox: {
    marginTop: 24,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
  },
  devLabel: {
    color: colors.danger,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
})
