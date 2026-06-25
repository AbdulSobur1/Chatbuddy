import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../lib/store'
import { colors, radius, shadows } from '../lib/theme'
import Avatar from '../components/Avatar'
import { useToast } from '../components/Toast'

export default function SettingsScreen({ navigation }) {
  const signOut = useAuthStore((s) => s.signOut)
  const user = useAuthStore((s) => s.user)
  const toast = useToast()

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ])
  }

  const menuSections = [
    {
      title: 'Account',
      items: [
        { icon: 'person-outline', label: 'Profile', subtitle: 'Edit your display name and status', onPress: () => navigation.navigate('Profile'), color: colors.primary },
        { icon: 'notifications-outline', label: 'Notifications', subtitle: 'Message and call notifications', color: '#e67e22', disabled: true, soon: true },
        { icon: 'lock-closed-outline', label: 'Privacy', subtitle: 'Last seen, profile photo, status', color: colors.accent, disabled: true, soon: true },
      ],
    },
    {
      title: 'Appearance',
      items: [
        { icon: 'moon-outline', label: 'Dark Mode', subtitle: 'Currently enabled', color: '#9b59b6', disabled: true, soon: true },
        { icon: 'text-outline', label: 'Font Size', subtitle: 'Default', color: colors.info, disabled: true, soon: true },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'help-circle-outline', label: 'Help & FAQ', subtitle: 'Get help with ChatBuddy', color: '#1abc9c', disabled: true },
        { icon: 'chatbox-ellipses-outline', label: 'Report a Problem', subtitle: 'Send feedback to the team', color: colors.danger, disabled: true },
      ],
    },
  ]

  const displayName = user?.user_metadata?.display_name || 'User'

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Profile Card */}
      <TouchableOpacity style={styles.profileCard} onPress={() => navigation.navigate('Profile')} activeOpacity={0.7}>
        <Avatar name={displayName} size="xl" />
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileStatus}>{user?.email || 'No email'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Menu Sections */}
      {menuSections.map((section, sIdx) => (
        <View key={sIdx} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.sectionCard}>
            {section.items.map((item, iIdx) => (
              <TouchableOpacity
                key={iIdx}
                style={[styles.menuItem, iIdx < section.items.length - 1 && styles.menuItemBorder, item.disabled && styles.menuItemDisabled]}
                onPress={item.onPress || (() => toast.show(`${item.label} coming soon!`, 'info'))}
                disabled={item.disabled}
              >
                <View style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}>
                  <Ionicons name={item.icon} size={20} color={item.color} />
                </View>
                <View style={styles.menuContent}>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </View>
                {item.soon ? <Text style={styles.comingSoon}>Soon</Text> : <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.sectionCard}>
          <View style={[styles.menuItem, styles.menuItemBorder]}>
            <View style={[styles.menuIcon, { backgroundColor: `${colors.primary}20` }]}>
              <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuLabel}>Version</Text>
              <Text style={styles.menuSubtitle}>1.0.0</Text>
            </View>
          </View>
          <View style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: `${colors.primary}20` }]}>
              <Ionicons name="code-slash-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuLabel}>Built with</Text>
              <Text style={styles.menuSubtitle}>React Native • Expo • Supabase</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 16,
    borderRadius: radius.lg, padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: colors.border,
  },
  profileInfo: { flex: 1, marginLeft: 14 },
  profileName: { color: colors.textPrimary, fontSize: 18, fontWeight: '600' },
  profileStatus: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  section: { marginBottom: 24, paddingHorizontal: 16 },
  sectionTitle: {
    color: colors.textMuted, fontSize: 13, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginLeft: 4,
  },
  sectionCard: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  menuItemBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  menuItemDisabled: { opacity: 0.5 },
  menuIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  menuContent: { flex: 1 },
  menuLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  menuSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  comingSoon: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, marginHorizontal: 16,
    backgroundColor: `${colors.danger}15`, borderRadius: radius.md,
  },
  logoutText: { color: colors.danger, fontSize: 16, fontWeight: '500' },
})
