import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

import client from './api/client'

export async function registerForPushNotifications() {
  if (!Device.isDevice) return null

  const existing = await Notifications.getPermissionsAsync()
  let finalStatus = existing.status
  if (existing.status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync()
    finalStatus = requested.status
  }
  if (finalStatus !== 'granted') return null

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1677ff',
    })
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId
  const tokenResult = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
  const expoPushToken = tokenResult.data

  await client.post('/api/devices/register', {
    expo_push_token: expoPushToken,
    platform: Platform.OS,
    device_name: Device.deviceName,
  })

  return expoPushToken
}
