import React, { useState, useRef, useEffect, useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Animated, SafeAreaView, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../lib/store'
import { useColors, radius, shadows } from '../lib/theme'
import { useToast } from '../components/Toast'
import Input from '../components/Input'
import Button from '../components/Button'

export default function RegisterScreen({ navigation }) {
  const colors = useColors()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const signUp = useAuthStore((s) => s.signUp)
  const toast = useToast()

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(30)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start()
  }, [])

  const validate = () => {
    const newErrors = {}
    if (!displayName.trim()) newErrors.displayName = 'Display name is required'
    else if (displayName.trim().length < 2) newErrors.displayName = 'Display name must be at least 2 characters'
    if (!username.trim()) newErrors.username = 'Username is required'
    else if (!/^[a-zA-Z][a-zA-Z0-9_]{1,19}$/.test(username.trim())) newErrors.username = 'Start with a letter. Use letters, numbers, and underscores (2-20 chars)'
    if (!email.trim()) newErrors.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Invalid email address'
    if (!password) newErrors.password = 'Password is required'
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters'
    if (!confirmPassword) newErrors.confirmPassword = 'Please confirm your password'
    else if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleRegister = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      await signUp(email.trim(), password, displayName.trim(), username.trim())
      toast.show('Account created! You can now sign in.', 'success')
      navigation.goBack()
    } catch (error) { toast.show(error.message || 'Registration failed. Please try again.', 'error') }
    finally { setLoading(false) }
  }

  const styles = useMemo(() => makeStyles(colors), [colors])

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.bgDecor1} />
        <View style={styles.bgDecor2} />
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={styles.headerIcon}><Ionicons name="person-add" size={28} color="#fff" /></View>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Join ChatBuddy and start connecting with friends</Text>
            </View>
            <View style={styles.formCard}>
              <Input label="Display Name" placeholder="Your full name" value={displayName}
                onChangeText={(v) => { setDisplayName(v); if (errors.displayName) setErrors((e) => ({ ...e, displayName: null })) }}
                autoCapitalize="words" icon="person-outline" error={errors.displayName} />
              <Input label="Username" placeholder="Choose a unique @handle" value={username}
                onChangeText={(v) => { setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, '')); if (errors.username) setErrors((e) => ({ ...e, username: null })) }}
                icon="at-outline" hint="Your unique @handle. Others will find you by this." error={errors.username} />
              <Input label="Email" placeholder="you@example.com" value={email}
                onChangeText={(v) => { setEmail(v); if (errors.email) setErrors((e) => ({ ...e, email: null })) }}
                keyboardType="email-address" icon="mail-outline" error={errors.email} />
              <Input label="Password" placeholder="At least 6 characters" value={password}
                onChangeText={(v) => { setPassword(v); if (errors.password) setErrors((e) => ({ ...e, password: null })) }}
                secureTextEntry icon="lock-closed-outline" error={errors.password} />
              <Input label="Confirm Password" placeholder="Repeat your password" value={confirmPassword}
                onChangeText={(v) => { setConfirmPassword(v); if (errors.confirmPassword) setErrors((e) => ({ ...e, confirmPassword: null })) }}
                secureTextEntry icon="lock-closed-outline" error={errors.confirmPassword} />
              <Text style={styles.termsText}>By creating an account, you agree to our <Text style={styles.termsLink}>Terms of Service</Text> and <Text style={styles.termsLink}>Privacy Policy</Text></Text>
              <Button title="Create Account" onPress={handleRegister} loading={loading} disabled={loading} size="lg" fullWidth />
            </View>
            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.loginLink}>Sign In</Text></TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  keyboard: { flex: 1 },
  bgDecor1: { position: 'absolute', top: -80, right: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(108,99,255,0.06)' },
  bgDecor2: { position: 'absolute', bottom: 60, left: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(46,204,113,0.04)' },
  content: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 24 },
  headerIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16, ...shadows.glow },
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 20 },
  formCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 24, borderWidth: 1, borderColor: colors.border, ...shadows.lg },
  termsText: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  termsLink: { color: colors.primary, fontWeight: '500' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  loginText: { color: colors.textMuted, fontSize: 14 },
  loginLink: { color: colors.primary, fontSize: 14, fontWeight: '600' },
})
