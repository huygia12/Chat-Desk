import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { IconButton, TextInput } from 'react-native-paper'

import { colors } from '../theme/theme'

export default function MessageComposer({ sending, onSend, onUpload }) {
  const [value, setValue] = useState('')

  const handleSend = async () => {
    const text = value.trim()
    if (!text || sending) return
    setValue('')
    await onSend(text)
  }

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    })
    if (!result.canceled && result.assets?.[0]) {
      await onUpload(result.assets[0])
    }
  }

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
    if (!result.canceled && result.assets?.[0]) {
      await onUpload(result.assets[0])
    }
  }

  return (
    <View style={styles.container}>
      <IconButton icon="image-outline" size={22} onPress={pickImage} disabled={sending} />
      <IconButton icon="paperclip" size={22} onPress={pickFile} disabled={sending} />
      <TextInput
        mode="outlined"
        value={value}
        onChangeText={setValue}
        placeholder="Nhap tin nhan"
        dense
        multiline
        maxLength={2000}
        style={styles.input}
        outlineStyle={styles.inputOutline}
      />
      <IconButton
        icon="send"
        mode="contained"
        size={20}
        onPress={handleSend}
        disabled={sending || !value.trim()}
        style={styles.send}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    backgroundColor: colors.surface,
  },
  inputOutline: {
    borderRadius: 8,
  },
  send: {
    marginLeft: 4,
    backgroundColor: colors.primary,
  },
})
