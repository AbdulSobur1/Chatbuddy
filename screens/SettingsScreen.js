import React from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
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

  return (
    <View style={styles.container}>
      {/* Profile Card */}
      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => navigation.navigate('Profile')}
      >
        <View style={styles.menuIcon}>
          <Ionicons name="person-outline" size={22} color="#6c63ff" />
        </View>
        <View style={styles.menuContent}>
          <Text style={styles.menuLabel}>Profile</Text>
          <Text style={styles.menuValue}>Edit your display name and status</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#555" />
      </TouchableOpacity>

      {/* Account Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{user?.email || 'Unknown'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>User ID</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {user?.id?.substring(0, 12)}...
          </Text>
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Version</Text>
          <Text style={styles.infoValue}>1.0.0</Text>
        </View>
      </View>

      <View style={styles.spacer} />

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={22} color="#ff4757" />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    paddingTop: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#16213e',
    marginHorizontal: 12,
    borderRadius: 14,
    marginBottom: 20,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(108,99,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContent: {
    flex: 1,
    marginLeft: 14,
  },
  menuLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  menuValue: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2a4a',
  },
  infoLabel: {
    color: '#aaa',
    fontSize: 15,
  },
  infoValue: {
    color: '#fff',
    fontSize: 15,
    maxWidth: '60%',
  },
  spacer: {
    flex: 1,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginBottom: 32,
    backgroundColor: 'rgba(255,71,87,0.1)',
    borderRadius: 14,
  },
  logoutText: {
    color: '#ff4757',
    fontSize: 16,
    fontWeight: '500',
  },
})
