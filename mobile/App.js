import { useEffect, useMemo } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'

import { useAuthStore } from './src/store/authStore'
import { useChatStore } from './src/store/chatStore'
import { useLanguageStore } from './src/store/languageStore'
import { useThemeStore } from './src/store/themeStore'
import { translate } from './src/i18n/dictionaries'
import { createNavigationTheme, createTheme } from './src/theme/theme'
import LoginScreen from './src/screens/LoginScreen'
import RegisterScreen from './src/screens/RegisterScreen'
import ConversationListScreen from './src/screens/ConversationListScreen'
import ChatScreen from './src/screens/ChatScreen'
import ChannelsScreen from './src/screens/ChannelsScreen'
import EmployeesScreen from './src/screens/EmployeesScreen'
import ProductsScreen from './src/screens/ProductsScreen'
import AssignmentCenterScreen from './src/screens/AssignmentCenterScreen'
import SavedRepliesScreen from './src/screens/SavedRepliesScreen'
import LabelsScreen from './src/screens/LabelsScreen'
import StatisticsScreen from './src/screens/StatisticsScreen'
import AccountSettingsScreen from './src/screens/AccountSettingsScreen'
import MenuScreen from './src/screens/MenuScreen'
import AIAssistantBubble from './src/components/AIAssistantBubble'
import { registerForPushNotifications } from './src/notifications'
import { navigate, navigationRef } from './src/navigation/rootNavigation'

const Stack = createNativeStackNavigator()

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export default function App() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const bootstrapped = useAuthStore((state) => state.bootstrapped)
  const loadSession = useAuthStore((state) => state.loadSession)
  const language = useLanguageStore((state) => state.language)
  const languageBootstrapped = useLanguageStore((state) => state.bootstrapped)
  const loadLanguage = useLanguageStore((state) => state.loadLanguage)
  const themeBootstrapped = useThemeStore((state) => state.bootstrapped)
  const isDark = useThemeStore((state) => state.isDark)
  const loadTheme = useThemeStore((state) => state.loadTheme)
  const paperTheme = useMemo(() => createTheme(isDark), [isDark])
  const navigationTheme = useMemo(() => createNavigationTheme(isDark), [isDark])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  useEffect(() => {
    loadLanguage()
  }, [loadLanguage])

  useEffect(() => {
    loadTheme()
  }, [loadTheme])

  useEffect(() => {
    if (token && user && ['business', 'employee'].includes(user.role)) {
      registerForPushNotifications().catch((error) => {
        console.warn('Push registration failed:', error)
      })
    }
  }, [token, user])

  useEffect(() => {
    if (!token || !user) return undefined

    const openConversationFromNotification = async (response) => {
      const conversationId = response?.notification?.request?.content?.data?.conversation_id
      if (!conversationId) return

      try {
        const conversation = await useChatStore.getState().openConversationById(conversationId)
        navigate('Chat', { title: conversation.contact?.display_name || translate(language, 'chat.title') })
      } catch (error) {
        console.warn('Failed to open notification conversation:', error)
      }
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(openConversationFromNotification)
    Notifications.getLastNotificationResponseAsync()
      .then(openConversationFromNotification)
      .catch((error) => console.warn('Failed to read last notification response:', error))

    return () => subscription.remove()
  }, [language, token, user])

  if (!bootstrapped || !languageBootstrapped || !themeBootstrapped) {
    return null
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <NavigationContainer ref={navigationRef} theme={navigationTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {token && user ? (
              <>
                <Stack.Screen name="Conversations" component={ConversationListScreen} />
                <Stack.Screen name="Chat" component={ChatScreen} />
                <Stack.Screen name="Channels" component={ChannelsScreen} />
                <Stack.Screen name="Employees" component={EmployeesScreen} />
                <Stack.Screen name="Products" component={ProductsScreen} />
                <Stack.Screen name="Assignments" component={AssignmentCenterScreen} />
                <Stack.Screen name="SavedReplies" component={SavedRepliesScreen} />
                <Stack.Screen name="Labels" component={LabelsScreen} />
                <Stack.Screen name="Statistics" component={StatisticsScreen} />
                <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} />
                <Stack.Screen name="Menu" component={MenuScreen} />
              </>
            ) : (
              <>
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Register" component={RegisterScreen} />
              </>
            )}
          </Stack.Navigator>
          {token && user ? <AIAssistantBubble /> : null}
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  )
}
