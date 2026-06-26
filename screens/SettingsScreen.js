import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../lib/store'
import { useColors, colors as staticColors, radius, setThemeMode, getThemeMode, setAccentColor, getAccentColor, ACCENT_PRESETS } from '../lib/theme'
import { getSoundsEnabled, setSoundsEnabled } from '../lib/sounds'
import Avatar from '../components/Avatar'
import { useToast } from '../components/Toast'

export default function SettingsScreen({ navigation }) {
  const signOut = useAuthStore((s) => s.signOut)
  const user = useAuthStore((s) => s.user)
  const colors = useColors()
  const toast = useToast()
  const [darkMode, setDarkMode] = useState(getThemeMode() !== 'light')
  const [selectedAccent, setSelectedAccent] = useState(getAccentColor())
  const [typingSounds, setTypingSounds] = useState(getSoundsEnabled())

  const toggleDarkMode = (value) => {
    setDarkMode(value)
    setThemeMode(value ? 'dark' : 'light')
    toast.show(value ? 'Dark mode enabled' : 'Light mode enabled', 'success')
  }

  const handleAccentPick = (hex) => {
    const newAccent = hex === '#6c63ff' ? null : hex // null = default (purple)
    setSelectedAccent(newAccent)
    setAccentColor(newAccent)
    toast.show('Accent color updated!', 'success')
  }

  const toggleTypingSounds = (value) => {
    setTypingSounds(value)
    setSoundsEnabled(value)
    toast.show(value ? 'Typing sounds on' : 'Typing sounds off', 'info')
  }

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
      items: [          { icon: 'moon-outline', label: 'Dark Mode', subtitle: 'Toggle dark and light theme', color: '#9b59b6', toggle: true, value: darkMode, onToggle: toggleDarkMode },
        { icon: 'color-palette-outline', label: 'Accent Color', subtitle: selectedAccent ? (ACCENT_PRESETS.find(p => p.hex === selectedAccent)?.name || 'Custom') : 'Default (Purple)', color: selectedAccent || colors.primary, accentPicker: true },
        { icon: 'musical-notes-outline', label: 'Typing Sounds', subtitle: 'Play a sound when someone types', color: '#e67e22', toggle: true, value: typingSounds, onToggle: toggleTypingSounds },
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
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} showsVerticalScrollIndicator={false}>
      {/* Profile Card */}
      <TouchableOpacity
        style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 16,
          borderRadius: radius.lg, padding: 16, marginBottom: 24,
          borderWidth: 1, borderColor: colors.border,
        }}
        onPress={() => navigation.navigate('Profile')}
        activeOpacity={0.7}
      >
        <Avatar name={displayName} size="xl" />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600' }}>{displayName}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{user?.email || 'No email'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Menu Sections */}
      {menuSections.map((section, sIdx) => (
        <View key={sIdx} style={{ marginBottom: 24, paddingHorizontal: 16 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 13, fontWeight: '600',
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginLeft: 4,
          }}>
            {section.title}
          </Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' }}>
            {section.items.map((item, iIdx) => (
              <TouchableOpacity
                key={iIdx}
                style={[
                  {
                    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16,
                  },
                  iIdx < section.items.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                  item.disabled && { opacity: 0.5 },
                ]}
                onPress={item.toggle ? null : (item.onPress || (() => toast.show(`${item.label} coming soon!`, 'info')))}
                disabled={item.disabled && !item.toggle}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${item.color}20`, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  <Ionicons name={item.icon} size={20} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>{item.label}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{item.subtitle}</Text>
                </View>
                {item.toggle ? (
                  <Switch
                    value={item.value}
                    onValueChange={item.onToggle}
                    trackColor={{ false: colors.border, true: `${colors.primary}60` }}
                    thumbColor={item.value ? colors.primary : colors.textMuted}
                  />
                ) : item.accentPicker ? (
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {ACCENT_PRESETS.slice(0, 5).map((p) => (
                      <TouchableOpacity
                        key={p.hex}
                        onPress={() => handleAccentPick(p.hex)}
                        style={{
                          width: 24, height: 24, borderRadius: 12,
                          backgroundColor: p.hex,
                          borderWidth: (selectedAccent === p.hex || (!selectedAccent && p.hex === '#6c63ff')) ? 2.5 : 0,
                          borderColor: '#fff',
                        }}
                      />
                    ))}
                  </View>
                ) : item.soon ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: 'italic' }}>Soon</Text>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      {/* About */}
      <View style={{ marginBottom: 24, paddingHorizontal: 16 }}>
        <Text style={{
          color: colors.textMuted, fontSize: 13, fontWeight: '600',
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginLeft: 4,
        }}>About</Text>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${colors.primary}20`, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>Version</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>1.0.0</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${colors.primary}20`, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <Ionicons name="code-slash-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>Built with</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>React Native • Expo • Supabase</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 8, paddingVertical: 16, marginHorizontal: 16,
          backgroundColor: `${colors.danger}15`, borderRadius: radius.md,
        }}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={{ color: colors.danger, fontSize: 16, fontWeight: '500' }}>Sign Out</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  )
}
