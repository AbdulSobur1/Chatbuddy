import React, { useRef, useEffect, useMemo } from 'react'
import {
  View, Text, Platform, StyleSheet, TouchableOpacity, Animated, Dimensions,
} from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { NavigationContainer } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'

import { useAuthStore } from '../lib/store'
import { navigationRef } from '../lib/navigation'
import { useColors, radius, shadows } from '../lib/theme'

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

// AI Assistant
import AIAssistantScreen from '../screens/AIAssistantScreen'

import ErrorBoundary from '../components/ErrorBoundary'
import { PageSkeleton } from '../components/Skeleton'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

// ─── Tab Configuration ─────────────────────────────────────────
const TAB_CONFIG = [
  { name: 'ChatsTab', label: 'Chats', icon: 'chatbubbles', iconFocused: 'chatbubbles' },
  { name: 'ChannelsTab', label: 'Channels', icon: 'megaphone', iconFocused: 'megaphone' },
  { name: 'GroupsTab', label: 'Groups', icon: 'people', iconFocused: 'people' },
  { name: 'UpdatesTab', label: 'Updates', icon: 'cellular', iconFocused: 'cellular' },
  { name: 'CallsTab', label: 'Calls', icon: 'call', iconFocused: 'call' },
  { name: 'SettingsTab', label: 'Settings', icon: 'settings', iconFocused: 'settings' },
]

// ─── Get container width for pill positioning ─────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window')
const TAB_BAR_HORIZONTAL_MARGIN = 12
const INNER_PADDING = 4
const PILL_MARGIN = 4

// ─── Animated Tab Bar ──────────────────────────────────────────
function AnimatedTabBar({ state, descriptors, navigation }) {
  const colors = useColors()
  const tabCount = state.routes.length
  const pillAnim = useRef(new Animated.Value(0)).current
  const prevIndex = useRef(state.index)

  useEffect(() => {
    if (prevIndex.current !== state.index) {
      Animated.spring(pillAnim, {
        toValue: state.index,
        friction: 8,
        tension: 60,
        useNativeDriver: false,
      }).start()
      prevIndex.current = state.index
    }
  }, [state.index, pillAnim])

  const totalWidth = SCREEN_WIDTH - TAB_BAR_HORIZONTAL_MARGIN * 2 - INNER_PADDING
  const pillWidth = totalWidth / tabCount
  const pillLeft = pillAnim.interpolate({
    inputRange: tabCount > 0
      ? Array.from({ length: tabCount }, (_, i) => i)
      : [0],
    outputRange: tabCount > 0
      ? Array.from({ length: tabCount }, (_, i) => i * pillWidth + PILL_MARGIN)
      : [0],
  })

  const styles = useMemo(() => StyleSheet.create({
    container: { backgroundColor: colors.bg, paddingBottom: Platform.OS === 'ios' ? 20 : 6, paddingTop: 6 },
    inner: {
      flexDirection: 'row', backgroundColor: colors.surface, marginHorizontal: 12,
      borderRadius: radius.xl, paddingVertical: 4, position: 'relative',
      borderWidth: 1, borderColor: colors.border, ...shadows.md,
    },
    activePill: {
      position: 'absolute', top: 4, bottom: 4,
      backgroundColor: `${colors.primary}18`, borderRadius: radius.lg,
    },
    tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 2 },
    tabLabel: { fontSize: 10, fontWeight: '600' },
  }), [colors])

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Animated.View
          style={[styles.activePill, { width: pillWidth - PILL_MARGIN * 2, transform: [{ translateX: pillLeft }] }]}
        />
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]
          const isFocused = state.index === index
          const config = TAB_CONFIG[index] || TAB_CONFIG[0]
          return (
            <TabItem
              key={route.key}
              route={route}
              isFocused={isFocused}
              config={config}
              options={options}
              navigation={navigation}
              colors={colors}
            />
          )
        })}
      </View>
    </View>
  )
}

// ─── Individual Tab Item ────────────────────────────────────────
function TabItem({ route, isFocused, config, options, navigation, colors }) {
  const iconScale = useRef(new Animated.Value(isFocused ? 1.1 : 1)).current

  useEffect(() => {
    Animated.spring(iconScale, {
      toValue: isFocused ? 1.1 : 1,
      friction: 6,
      tension: 100,
      useNativeDriver: true,
    }).start()
  }, [isFocused, iconScale])

  const onPress = () => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name)
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
      activeOpacity={0.7}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 2 }}
    >
      <Animated.View style={{ transform: [{ scale: iconScale }] }}>
        <Ionicons
          name={isFocused ? config.icon : `${config.icon}-outline`}
          size={22}
          color={isFocused ? colors.primary : colors.textMuted}
        />
      </Animated.View>
      <Text style={{ fontSize: 10, fontWeight: '600', color: isFocused ? colors.primary : colors.textMuted }}>
        {config.label}
      </Text>
    </TouchableOpacity>
  )
}

// ─── Theme-aware Stack Navigator factory ───────────────────────
function ThemeStacks() {
  const colors = useColors()

  const stackScreenOptions = useMemo(() => ({
    headerStyle: { backgroundColor: colors.bgSecondary },
    headerTintColor: colors.textPrimary,
    headerTitleStyle: { fontWeight: '600', fontSize: 17 },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.bg },
    animation: 'slide_from_right',
  }), [colors])

  return { stackScreenOptions }
}

// ─── Auth Stack ────────────────────────────────────────────────
function AuthStack({ screenOptions }) {
  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  )
}

// ─── Chats Tab ─────────────────────────────────────────────────
function ChatsStack({ screenOptions }) {
  return (
    <ErrorBoundary name="Chats">
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="ChatsList" component={ChatsListScreen} options={{ title: 'ChatBuddy', headerLargeTitle: true }} />
        <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
        <Stack.Screen name="AIAssistant" component={AIAssistantScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </ErrorBoundary>
  )
}

// ─── Channels Tab ──────────────────────────────────────────────
function ChannelsStack({ screenOptions }) {
  return (
    <ErrorBoundary name="Channels">
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="ChannelsList" component={ChannelsListScreen} options={{ title: 'Channels' }} />
        <Stack.Screen name="ChannelView" component={ChannelViewScreen} options={{ headerShown: false }} />
        <Stack.Screen name="CreateChannel" component={CreateChannelScreen} options={{ title: 'New Channel' }} />
        <Stack.Screen name="Invite" component={InviteScreen} options={{ title: 'Join Channel' }} />
      </Stack.Navigator>
    </ErrorBoundary>
  )
}

// ─── Groups Tab ────────────────────────────────────────────────
function GroupsStack({ screenOptions }) {
  return (
    <ErrorBoundary name="Groups">
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="GroupsList" component={GroupsListScreen} options={{ title: 'Groups' }} />
        <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
        <Stack.Screen name="GroupInfo" component={GroupInfoScreen} options={{ title: 'Group Info' }} />
        <Stack.Screen name="CreateGroup" component={CreateGroupScreen} options={{ title: 'New Group' }} />
        <Stack.Screen name="Invite" component={InviteScreen} options={{ title: 'Join Group' }} />
      </Stack.Navigator>
    </ErrorBoundary>
  )
}

// ─── Updates Tab ───────────────────────────────────────────────
function UpdatesStack({ screenOptions }) {
  return (
    <ErrorBoundary name="Updates">
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="UpdatesList" component={UpdatesScreen} options={{ title: 'Updates' }} />
      </Stack.Navigator>
    </ErrorBoundary>
  )
}

// ─── Calls Tab ─────────────────────────────────────────────────
function CallsStack({ screenOptions }) {
  return (
    <ErrorBoundary name="Calls">
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="CallsList" component={CallsScreen} options={{ title: 'Calls' }} />
      </Stack.Navigator>
    </ErrorBoundary>
  )
}

// ─── Settings Tab ──────────────────────────────────────────────
function SettingsStack({ screenOptions }) {
  return (
    <ErrorBoundary name="Settings">
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: 'Settings' }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      </Stack.Navigator>
    </ErrorBoundary>
  )
}

// ─── Main Bottom Tabs ──────────────────────────────────────────
function MainTabs({ screenOptions }) {
  return (
    <Tab.Navigator tabBar={(props) => <AnimatedTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="ChatsTab" children={() => <ChatsStack screenOptions={screenOptions} />} />
      <Tab.Screen name="ChannelsTab" children={() => <ChannelsStack screenOptions={screenOptions} />} />
      <Tab.Screen name="GroupsTab" children={() => <GroupsStack screenOptions={screenOptions} />} />
      <Tab.Screen name="UpdatesTab" children={() => <UpdatesStack screenOptions={screenOptions} />} />
      <Tab.Screen name="CallsTab" children={() => <CallsStack screenOptions={screenOptions} />} />
      <Tab.Screen name="SettingsTab" children={() => <SettingsStack screenOptions={screenOptions} />} />
    </Tab.Navigator>
  )
}

// ─── Root Navigator ────────────────────────────────────────────
export default function AppNavigator() {
  const { session, loading } = useAuthStore()
  const colors = useColors()

  const { stackScreenOptions } = ThemeStacks()

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <PageSkeleton type="list" />
      </View>
    )
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {session ? <MainTabs screenOptions={stackScreenOptions} /> : <AuthStack screenOptions={stackScreenOptions} />}
    </NavigationContainer>
  )
}
