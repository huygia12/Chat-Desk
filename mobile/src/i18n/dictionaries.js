export const defaultLanguage = 'vi'

export const dictionaries = {
  vi: {
    language: {
      toggle: 'VIE',
      toggleLabel: 'Đổi ngôn ngữ',
    },
    auth: {
      email: 'Email',
      password: 'Mật khẩu',
      loginSubtitle: 'Đăng nhập dành cho doanh nghiệp và nhân viên CSKH',
      loginButton: 'Đăng nhập',
      loginFailed: 'Đăng nhập thất bại',
      registerBusiness: 'Tạo tài khoản doanh nghiệp',
      registerTitle: 'Tạo tài khoản',
      businessName: 'Tên doanh nghiệp',
      phone: 'Số điện thoại',
      registerButton: 'Đăng ký',
      registerFailed: 'Đăng ký thất bại',
      backToLogin: 'Quay lại đăng nhập',
      mobileOnly: 'Ứng dụng mobile chỉ dành cho tài khoản doanh nghiệp hoặc nhân viên CSKH.',
    },
    conversations: {
      title: 'Hội thoại',
      searchPlaceholder: 'Tìm theo tên, email, SĐT',
      allPlatforms: 'Tất cả',
      emptyTitle: 'Chưa có hội thoại',
      emptySubtitle: 'Tin nhắn mới sẽ xuất hiện tại đây.',
      reload: 'Tải lại',
      guest: 'Khách',
      unknownPlatform: 'unknown',
    },
    chat: {
      title: 'Hội thoại',
      empty: 'Chưa có tin nhắn trong hội thoại này.',
      inputPlaceholder: 'Nhập tin nhắn',
      openAttachment: 'Mở tệp',
    },
  },
  en: {
    language: {
      toggle: 'ENG',
      toggleLabel: 'Change language',
    },
    auth: {
      email: 'Email',
      password: 'Password',
      loginSubtitle: 'Sign in for business owners and support staff',
      loginButton: 'Sign in',
      loginFailed: 'Sign in failed',
      registerBusiness: 'Create business account',
      registerTitle: 'Create account',
      businessName: 'Business name',
      phone: 'Phone number',
      registerButton: 'Sign up',
      registerFailed: 'Registration failed',
      backToLogin: 'Back to sign in',
      mobileOnly: 'The mobile app is only available for business and support staff accounts.',
    },
    conversations: {
      title: 'Conversations',
      searchPlaceholder: 'Search by name, email, phone',
      allPlatforms: 'All',
      emptyTitle: 'No conversations yet',
      emptySubtitle: 'New messages will appear here.',
      reload: 'Reload',
      guest: 'Guest',
      unknownPlatform: 'unknown',
    },
    chat: {
      title: 'Conversation',
      empty: 'There are no messages in this conversation yet.',
      inputPlaceholder: 'Type a message',
      openAttachment: 'Open file',
    },
  },
}

const resolveKey = (dictionary, key) =>
  key.split('.').reduce((value, part) => value?.[part], dictionary)

export function translate(language, key, params = {}) {
  const dictionary = dictionaries[language] || dictionaries[defaultLanguage]
  const value = resolveKey(dictionary, key) ?? resolveKey(dictionaries[defaultLanguage], key) ?? key

  if (typeof value !== 'string') return key

  return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '')
}
