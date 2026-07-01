import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Animated, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../lib/store'
import { useColors, radius, shadows } from '../lib/theme'
import { useToast } from '../components/Toast'
import Input from '../components/Input'
import Button from '../components/Button'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

export default function LoginScreen({ navigation }) {
  const colors = useColors()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const signIn = useAuthStore((s) => s.signIn)
  const toast = useToast()

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(30)).current
  const logoAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start()
  }, [])

  const validate = () => {
    const newErrors = {}
    if (!email.trim()) newErrors.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Invalid email address'
    if (!password) newErrors.password = 'Password is required'
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleLogin = async () => {
    if (!validate()) return
    setLoading(true)
    try { await signIn(email.trim(), password) }
    catch (error) { toast.show(error.message || 'Login failed. Please try again.', 'error') }
    finally { setLoading(false) }
  }

  const styles = useMemo(() => makeStyles(colors), [colors])
  const logoScale = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.bgDecor1} />
        <View style={styles.bgDecor2} />

        <Animated.View style={[styles.logoSection, { opacity: logoAnim, transform: [{ scale: logoScale }] }]}>
          <View style={styles.logoContainer}>
            <View style={styles.logoIcon}>
              <Ionicons name="chatbubbles" size={36} color="#fff" />
            </View>
          </View>
          <Text style={styles.appName}>ChatBuddy</Text>
          <Text style={styles.tagline}>Connect with anyone, anywhere</Text>
        </Animated.View>

        <Animated.View style={[styles.formSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.formCard}>
            <Text style={styles.welcomeTitle}>Welcome Back</Text>
            <Text style={styles.welcomeSub}>Sign in to continue your conversations</Text>

            <Input label="Email" placeholder="you@example.com" value={email}
              onChangeText={(v) => { setEmail(v); if (errors.email) setErrors((e) => ({ ...e, email: null })) }}
              keyboardType="email-address" autoCapitalize="none" icon="mail-outline" error={errors.email} />

            <Input label="Password" placeholder="Enter your password" value={password}
              onChangeText={(v) => { setPassword(v); if (errors.password) setErrors((e) => ({ ...e, password: null })) }}
              secureTextEntry icon="lock-closed-outline" error={errors.password} />

            <TouchableOpacity style={styles.forgotRow} onPress={() => toast.show('Password reset coming soon!', 'info')}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <Button title="Sign In" onPress={handleLogin} loading={loading} disabled={loading} size="lg" fullWidth style={styles.signInButton} />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialRow}>
              {['logo-google', 'logo-apple', 'logo-github'].map((icon) => (
                <TouchableOpacity key={icon} style={styles.socialBtn} activeOpacity={0.7}
                  onPress={() => toast.show(`${icon.replace('logo-', '').charAt(0).toUpperCase() + icon.slice(6)} sign in coming soon!`, 'info')}>
                  <Ionicons name={icon} size={22} color="#fff" />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.signupLink}>Create Account</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  keyboard: { flex: 1 },
  bgDecor1: { position: 'absolute', top: -100, right: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(108,99,255,0.08)' },
  bgDecor2: { position: 'absolute', top: 80, left: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(46,204,113,0.05)' },
  logoSection: { alignItems: 'center', paddingTop: SCREEN_HEIGHT * 0.07, paddingBottom: 24 },
  logoContainer: { marginBottom: 16 },
  logoIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', ...shadows.glow },
  appName: { fontSize: 32, fontWeight: '700', color: colors.textPrimary, letterSpacing: 0.5 },
  tagline: { fontSize: 14, color: colors.textMuted, marginTop: 6 },
  formSection: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  formCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 28, borderWidth: 1, borderColor: colors.border, ...shadows.lg },
  welcomeTitle: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  welcomeSub: { fontSize: 14, color: colors.textMuted, marginBottom: 28 },
  forgotRow: { alignSelf: 'flex-end', marginTop: -8, marginBottom: 20 },
  forgotText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  signInButton: { borderRadius: radius.md },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 12, marginHorizontal: 12 },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  socialBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceHover, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 32, paddingBottom: 20 },
  signupText: { color: colors.textMuted, fontSize: 14 },
  signupLink: { color: colors.primary, fontSize: 14, fontWeight: '600' },
})
