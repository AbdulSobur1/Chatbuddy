import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { withThemeColors } from '../lib/theme'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) { return { hasError: true, error } }

  componentDidCatch(error, errorInfo) {
    console.error(`ErrorBoundary [${this.props.name || 'unknown'}]:`, error, errorInfo)
  }

  handleRetry = () => this.setState({ hasError: false, error: null })

  render() {
    const { colors } = this.props
    if (this.state.hasError) {
      return (
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.danger}15` }]}>
            <Ionicons name="bug-outline" size={48} color={colors.danger} />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Something went wrong</Text>
          <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
            {this.props.name ? `An error occurred in ${this.props.name}.` : 'An unexpected error occurred.'}
          </Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>You can try again or restart the app.</Text>
          <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={this.handleRetry} activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
          {__DEV__ && this.state.error && (
            <View style={[styles.devBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.devLabel, { color: colors.danger }]}>DEV: {this.state.error?.message}</Text>
              <Text style={[styles.devLabel, { color: colors.textTertiary, marginTop: 8, fontSize: 10 }]}>
                {this.state.error?.stack?.split('\n').slice(0, 6).join('\n')}
              </Text>
            </View>
          )}
        </View>
      )
    }
    return this.props.children
  }
}

export default withThemeColors(ErrorBoundary)

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  iconWrap: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 4 },
  hint: { fontSize: 13, textAlign: 'center', marginBottom: 28 },
  button: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 9999 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  devBox: { marginTop: 24, padding: 12, borderRadius: 12, borderWidth: 1, width: '100%' },
  devLabel: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
})
