import { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'

import { useAuthStore } from './src/store/authStore'
import { useChatStore } from './src/store/chatStore'
import { useLanguageStore } from './src/store/languageStore'
import { translate } from './src/i18n/dictionaries'
import { theme } from './src/theme/theme'
import LoginScreen from './src/screens/LoginScreen'
import RegisterScreen from './src/screens/RegisterScreen'
import ConversationListScreen from './src/screens/ConversationListScreen'
import ChatScreen from './src/screens/ChatScreen'
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

  useEffect(() => {
    async function bootstrap() {
      await loadLanguage()
      await loadSession()
    }

    bootstrap()
  }, [loadLanguage, loadSession])

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

  if (!bootstrapped || !languageBootstrapped) {
    return null
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {token && user ? (
              <>
                <Stack.Screen name="Conversations" component={ConversationListScreen} />
                <Stack.Screen name="Chat" component={ChatScreen} />
              </>
            ) : (
              <>
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Register" component={RegisterScreen} />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  )
}
