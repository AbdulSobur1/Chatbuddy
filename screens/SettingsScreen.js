import React from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../lib/store'

export default function SettingsScreen({ navigation }) {
  const signOut = useAuthStore((s) => s.signOut)
  const user = useAuthStore((s) => s.user)

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: signOut,
      },
    ])
  }

  const menuSections = [
    {
      title: 'Account',
      items: [
        {
          icon: 'person-outline',
          label: 'Profile',
          subtitle: 'Edit your display name and status',
          onPress: () => navigation.navigate('Profile'),
          color: '#6c63ff',
        },
        {
          icon: 'notifications-outline',
          label: 'Notifications',
          subtitle: 'Message and call notifications',
          onPress: () => {},
          color: '#e67e22',
          disabled: true,
        },
        {
          icon: 'lock-closed-outline',
          label: 'Privacy',
          subtitle: 'Last seen, profile photo, status',
          onPress: () => {},
          color: '#2ecc71',
          disabled: true,
        },
      ],
    },
    {
      title: 'Appearance',
      items: [
        {
          icon: 'moon-outline',
          label: 'Dark Mode',
          subtitle: 'Currently enabled',
          onPress: () => {},
          color: '#9b59b6',
          disabled: true,
        },
        {
          icon: 'text-outline',
          label: 'Font Size',
          subtitle: 'Default',
          onPress: () => {},
          color: '#3498db',
          disabled: true,
        },
      ],
    },
    {
      title: 'Support',
      items: [
        {
          icon: 'help-circle-outline',
          label: 'Help & FAQ',
          subtitle: 'Get help with ChatBuddy',
          onPress: () => {},
          color: '#1abc9c',
          disabled: true,
        },
        {
          icon: 'chatbox-ellipses-outline',
          label: 'Report a Problem',
          subtitle: 'Send feedback to the team',
          onPress: () => {},
          color: '#e74c3c',
          disabled: true,
        },
      ],
    },
  ]

  return (
    <ScrollView style={styles.container}>
      {/* Profile Card */}
      <TouchableOpacity
        style={styles.profileCard}
        onPress={() => navigation.navigate('Profile')}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.user_metadata?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>
            {user?.user_metadata?.display_name || 'User'}
          </Text>
          <Text style={styles.profileStatus}>
            {user?.email || 'No email'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#555" />
      </TouchableOpacity>

      {/* Menu Sections */}
      {menuSections.map((section, sIdx) => (
        <View key={sIdx} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.sectionCard}>
            {section.items.map((item, iIdx) => (
              <TouchableOpacity
                key={iIdx}
                style={[
                  styles.menuItem,
                  iIdx < section.items.length - 1 && styles.menuItemBorder,
                  item.disabled && styles.menuItemDisabled,
                ]}
                onPress={item.onPress}
                disabled={item.disabled}
              >
                <View style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}>
                  <Ionicons name={item.icon} size={20} color={item.color} />
                </View>
                <View style={styles.menuContent}>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </View>
                {item.disabled ? (
                  <Text style={styles.comingSoon}>Soon</Text>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="#444" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.sectionCard}>
          <View style={[styles.menuItem, styles.menuItemBorder]}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(108,99,255,0.1)' }]}>
              <Ionicons name="information-circle-outline" size={20} color="#6c63ff" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuLabel}>Version</Text>
              <Text style={styles.menuSubtitle}>1.0.0</Text>
            </View>
          </View>
          <View style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(108,99,255,0.1)' }]}>
              <Ionicons name="code-slash-outline" size={20} color="#6c63ff" />
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
        <Ionicons name="log-out-outline" size={22} color="#ff4757" />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#16213e', marginHorizontal: 16, marginTop: 16,
    borderRadius: 16, padding: 16, marginBottom: 24,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#6c63ff',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '600' },
  profileInfo: { flex: 1 },
  profileName: { color: '#fff', fontSize: 18, fontWeight: '600' },
  profileStatus: { color: '#888', fontSize: 13, marginTop: 2 },
  section: { marginBottom: 24, paddingHorizontal: 16 },
  sectionTitle: {
    color: '#888', fontSize: 13, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 10, marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: '#16213e', borderRadius: 14, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16,
  },
  menuItemBorder: { borderBottomWidth: 0.5, borderBottomColor: '#2a2a4a' },
  menuItemDisabled: { opacity: 0.6 },
  menuIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  menuContent: { flex: 1 },
  menuLabel: { color: '#fff', fontSize: 15, fontWeight: '500' },
  menuSubtitle: { color: '#888', fontSize: 12, marginTop: 2 },
  comingSoon: { color: '#555', fontSize: 12, fontStyle: 'italic' },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, marginHorizontal: 16,
    backgroundColor: 'rgba(255,71,87,0.1)', borderRadius: 14,
  },
  logoutText: { color: '#ff4757', fontSize: 16, fontWeight: '500' },
})
