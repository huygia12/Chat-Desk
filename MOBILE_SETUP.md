# Hướng Dẫn Chạy Mobile ChatDesk

App mobile nằm trong thư mục `mobile/`, dùng Expo React Native.

## 1. Cần Cài Đặt Gì

Trên máy phát triển:

- Node.js LTS và npm
- Git
- Expo CLI dùng qua `npx expo ...`
- Android Studio nếu chạy/build Android
- Xcode nếu chạy/build iOS, chỉ cài được trên macOS
- Expo Go trên điện thoại nếu muốn chạy thử nhanh bằng QR

Kiểm tra:

```bash
node -v
npm -v
```

## 2. Chuẩn Bị Backend

Mobile dùng chung backend hiện tại. Trước khi chạy app:

```bash
cd backend
alembic upgrade head
```

Sau đó chạy backend tại:

```text
http://localhost:8000
```

Nếu chạy trên điện thoại thật, backend nên bind `0.0.0.0` và máy tính phải mở firewall cho port `8000`.

## 3. Chuẩn Bị Mobile

```bash
cd mobile
npm install
```

Tạo file môi trường:

```powershell
Copy-Item .env.example .env
```

Nếu chạy Android emulator, dùng:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000
EXPO_PUBLIC_WS_URL=ws://10.0.2.2:8000
```

Nếu chạy iOS simulator, thường dùng được:

```env
EXPO_PUBLIC_API_URL=http://localhost:8000
EXPO_PUBLIC_WS_URL=ws://localhost:8000
```

Nếu chạy điện thoại thật, dùng IP LAN của máy tính, ví dụ:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.25:8000
EXPO_PUBLIC_WS_URL=ws://192.168.1.25:8000
```

Kiểm tra cấu hình:

```bash
npx expo install --check
npx expo-doctor
```

## 4. Chạy Thử Bằng Giả Lập

### Android Emulator

Cần chuẩn bị:

- Cài Android Studio
- Cài Android SDK
- Tạo một Android Virtual Device trong Device Manager
- Backend đang chạy
- `mobile/.env` dùng `10.0.2.2`

Chạy:

```bash
cd mobile
npm run android
```

Hoặc:

```bash
npm run start
```

Sau đó bấm phím:

```text
a
```

### iOS Simulator

Cần chuẩn bị:

- Máy macOS
- Cài Xcode
- Cài iOS Simulator trong Xcode
- Backend đang chạy
- `mobile/.env` dùng `localhost` hoặc IP phù hợp

Chạy:

```bash
cd mobile
npm run ios
```

Nếu script `ios` chưa có, chạy:

```bash
npx expo start --ios
```

## 5. Chạy Thử Trên Điện Thoại Thật Bằng Expo Go

Cần chuẩn bị:

- Điện thoại Android hoặc iPhone
- Cài Expo Go
- Điện thoại và máy tính cùng mạng Wi-Fi
- Backend đang chạy
- `mobile/.env` dùng IP LAN của máy tính

Chạy:

```bash
cd mobile
npm run start
```

Quét QR code bằng Expo Go.

Nếu không kết nối được qua LAN, dùng tunnel:

```bash
npx expo start --tunnel
```

## 6. Build Và Install Android

### Build APK/AAB Bằng EAS

Cần chuẩn bị:

- Tài khoản Expo
- Cài và đăng nhập EAS CLI
- Android package đã khai báo trong `mobile/app.json`
- Thiết bị Android thật hoặc emulator để cài thử

Cài EAS CLI:

```bash
npm install -g eas-cli
eas login
```

Cấu hình EAS lần đầu:

```bash
cd mobile
eas build:configure
```

Build Android preview để cài thử:

```bash
eas build -p android --profile preview
```

Sau khi build xong, Expo sẽ trả link tải file `.apk` hoặc `.aab` tùy profile.

### Cài APK Vào Android

Cần chuẩn bị:

- Bật Developer Options trên điện thoại Android
- Bật USB debugging
- Cài Android Platform Tools để có lệnh `adb`
- File `.apk`

Cài:

```bash
adb install path/to/app.apk
```

Nếu đã cài app cũ:

```bash
adb install -r path/to/app.apk
```

## 7. Build Và Install iOS

iOS có ràng buộc hơn Android.

Cần chuẩn bị:

- Máy macOS
- Xcode
- Apple Developer Account nếu cài lên iPhone thật hoặc phân phối TestFlight
- Thiết bị iPhone thật nếu muốn test push notification đầy đủ
- EAS CLI đã đăng nhập

Build iOS bằng EAS:

```bash
cd mobile
eas build -p ios --profile preview
```

Với iPhone thật, EAS sẽ yêu cầu cấu hình chứng chỉ, provisioning profile và device registration. Làm theo hướng dẫn tương tác của EAS.

Nếu muốn đưa lên TestFlight:

```bash
eas build -p ios --profile production
eas submit -p ios
```

## 8. Ghi Chú Quan Trọng

- App mobile chỉ hỗ trợ tài khoản `business` và `employee`.
- Tài khoản `admin` không dùng cho mobile.
- WebSocket mobile dùng JWT qua `/ws/me?token=...`.
- Push notification nên test trên thiết bị thật.
- Với Android emulator, luôn dùng `10.0.2.2` thay cho `localhost`.
- Với điện thoại thật, luôn dùng IP LAN của máy tính thay cho `localhost`.
