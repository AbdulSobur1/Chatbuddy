import { createNavigationContainerRef } from '@react-navigation/native'

export const navigationRef = createNavigationContainerRef()

/**
 * Navigate to a specific route when a notification is tapped.
 * Safe to call even if the navigation container isn't ready yet.
 */
export function navigateOnNotification(routeName, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(routeName, params)
  }
}
