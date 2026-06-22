import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { NavigationContainer } from '@react-navigation/native'
import { ActivityIndicator, View, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { useAuthStore } from '../lib/store'
import { navigationRef } from '../lib/navigation'

// Auth screens
import LoginScreen from '../screens/LoginScreen'
import RegisterScreen from '../screens/RegisterScreen'

// Tab screens
import ChatsListScreen from '../screens/ChatsListScreen'
import ChannelsListScreen from '../screens/ChannelsListScreen'
import GroupsListScreen from '../screens/GroupsListScreen'
import UpdatesScreen from '../screens/UpdatesScreen'
import CallsScreen from '../screens/CallsScreen'
import SettingsScreen from '../screens/SettingsScreen'

// Shared detail screens
import ChatScreen from '../screens/ChatScreen'
import ChannelViewScreen from '../screens/ChannelViewScreen'
import GroupInfoScreen from '../screens/GroupInfoScreen'
import ProfileScreen from '../screens/ProfileScreen'
import CreateChannelScreen from '../screens/CreateChannelScreen'
import CreateGroupScreen from '../screens/CreateGroupScreen'
import InviteScreen from '../screens/InviteScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

const screenOptions = {
  headerStyle: { backgroundColor: '#1a1a2e' },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '600' },
}

// ─── Auth Stack ──────────────────────────────────────────────
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'ChatBuddy' }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create Account' }} />
    </Stack.Navigator>
  )
}

// ─── Chats Tab ───────────────────────────────────────────────
function ChatsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ChatsList" component={ChatsListScreen} options={{ title: 'ChatBuddy' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Stack.Navigator>
  )
}

// ─── Channels Tab ────────────────────────────────────────────
function ChannelsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ChannelsList" component={ChannelsListScreen} options={{ title: 'Channels' }} />
      <Stack.Screen name="ChannelView" component={ChannelViewScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CreateChannel" component={CreateChannelScreen} options={{ title: 'New Channel' }} />
      <Stack.Screen name="Invite" component={InviteScreen} options={{ title: 'Join Channel' }} />
    </Stack.Navigator>
  )
}

// ─── Groups Tab ──────────────────────────────────────────────
function GroupsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="GroupsList" component={GroupsListScreen} options={{ title: 'Groups' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
      <Stack.Screen name="GroupInfo" component={GroupInfoScreen} options={{ title: 'Group Info' }} />
      <Stack.Screen name="CreateGroup" component={CreateGroupScreen} options={{ title: 'New Group' }} />
      <Stack.Screen name="Invite" component={InviteScreen} options={{ title: 'Join Group' }} />
    </Stack.Navigator>
  )
}

// ─── Updates Tab ─────────────────────────────────────────────
function UpdatesStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="UpdatesList" component={UpdatesScreen} options={{ title: 'Updates' }} />
    </Stack.Navigator>
  )
}

// ─── Calls Tab ───────────────────────────────────────────────
function CallsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="CallsList" component={CallsScreen} options={{ title: 'Calls' }} />
    </Stack.Navigator>
  )
}

// ─── Settings Tab ────────────────────────────────────────────
function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Stack.Navigator>
  )
}

// ─── Tab Icon Helper ─────────────────────────────────────────
function TabIcon({ name, focused }) {
  return (
    <Ionicons
      name={focused ? name : `${name}-outline`}
      size={22}
      color={focused ? '#6c63ff' : '#666'}
    />
  )
}

// ─── Main Bottom Tabs ────────────────────────────────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#16213e',
          borderTopColor: '#2a2a4a',
          borderTopWidth: 0.5,
          paddingBottom: Platform.OS === 'ios' ? 20 : 8,
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 85 : 65,
        },
        tabBarActiveTintColor: '#6c63ff',
        tabBarInactiveTintColor: '#666',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen
        name="ChatsTab"
        component={ChatsStack}
        options={{
          tabBarLabel: 'Chats',
          tabBarIcon: ({ focused }) => <TabIcon name="chatbubbles" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ChannelsTab"
        component={ChannelsStack}
        options={{
          tabBarLabel: 'Channels',
          tabBarIcon: ({ focused }) => <TabIcon name="megaphone" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="GroupsTab"
        component={GroupsStack}
        options={{
          tabBarLabel: 'Groups',
          tabBarIcon: ({ focused }) => <TabIcon name="people" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="UpdatesTab"
        component={UpdatesStack}
        options={{
          tabBarLabel: 'Updates',
          tabBarIcon: ({ focused }) => <TabIcon name="cellular" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="CallsTab"
        component={CallsStack}
        options={{
          tabBarLabel: 'Calls',
          tabBarIcon: ({ focused }) => <TabIcon name="call" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStack}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon name="settings" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  )
}

// ─── Root Navigator ──────────────────────────────────────────
export default function AppNavigator() {
  const { session, loading } = useAuthStore()

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' }}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    )
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {session ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  )
}
