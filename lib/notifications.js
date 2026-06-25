import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { supabase } from './supabase'
import { navigateOnNotification } from './navigation'

// ─── Configure how notifications behave when app is foregrounded ─────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

// ─── Register for push notifications ─────────────────────────────────
export async function registerForPushNotifications(userId) {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device')
    return null
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6c63ff',
    })
    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Calls',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 500, 200, 500],
      lightColor: '#2ecc71',
    })
    await Notifications.setNotificationChannelAsync('status', {
      name: 'Status Updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 100, 100, 100],
      lightColor: '#6c63ff',
    })
  }

  // Check existing permissions
  let { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  // If not granted, ask
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted')
    return null
  }

  // Get the Expo push token
  // projectId comes from app.json eas.projectId — not a credential, just a project identifier.
  // Expo falls back to app.json automatically if undefined.
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  })

  const pushToken = tokenData.data

  // Store in Supabase users table
  try {
    await supabase
      .from('users')
      .update({ push_token: pushToken })
      .eq('id', userId)
  } catch (error) {
    console.error('Failed to store push token:', error)
  }

  return pushToken
}

// ─── Add notification response listener (tap handling) ───────────────
export function addNotificationTapListener() {
  // Handle notification that caused the app to open (cold start)
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      handleNotificationTap(response.notification)
    }
  })

  // Handle notification tapped while app is open or in background
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      handleNotificationTap(response.notification)
    }
  )

  return subscription
}

// ─── Route notification taps to the correct screen ───────────────────
function handleNotificationTap(notification) {
  const data = notification.request.content.data

  if (!data) return

  // Navigate based on notification type
  if (data.channelId) {
    // Build a channel object for navigation
    const channel = {
      id: data.channelId,
      name: data.channelName || 'Chat',
      channel_type: data.channelType || 'dm',
    }

    navigateOnNotification('ChatsTab', {
      screen: 'Chat',
      params: { channel },
    })
  } else if (data.callId) {
    navigateOnNotification('CallsTab', {
      screen: 'CallsList',
    })
  }
}
