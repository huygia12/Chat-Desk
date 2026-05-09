# Hướng Dẫn Triển Khai Widget Chat

## 📋 Tổng Quan

Widget Chat cho phép bạn nhúng chat bot vào website của khách hàng. Khách hàng có thể gửi tin nhắn trực tiếp từ website, và các tin nhắn này sẽ được gửi đến dashboard của bạn.

## 🚀 Các Bước Triển Khai

### Bước 1: Tạo Widget Instance

1. Đăng nhập vào dashboard admin
2. Truy cập menu **Widgets** (cần tạo thêm nếu chưa có)
3. Click **Create Widget**
4. Nhập các tên miền website của khách hàng (Allowed Origins)
   - Ví dụ: `https://example.com`, `https://www.example.com`
5. Click **Create**

> Bạn sẽ nhận được:
>
> - **Widget ID**: `abcd1234...`
> - **Widget Secret**: `xyz789...`
> - **Embed Script URL**: `https://your-api.com/embed.js?id=...`

### Bước 2: Chia Sẻ Embed Code với Khách Hàng

Khách hàng cần thêm đoạn code này vào website của họ (trong thẻ `<head>` hoặc trước `</body>`):

```html
<script>
  window.ChatDeskWidget = {
    widgetId: "YOUR_WIDGET_ID",
    widgetSecret: "YOUR_WIDGET_SECRET",
    businessName: "Your Business Name", // Tên hiển thị trên chat
    apiUrl: "https://your-api.com", // URL backend của bạn (tùy chọn)
  };
</script>
<script src="https://your-api.com/embed.js"></script>
```

### Bước 3: Kiểm Tra Widget

1. Khách hàng lưu code vào website
2. Tải lại website
3. Một nút chat hình tròn (💬) sẽ xuất hiện ở góc dưới phải
4. Click nó để mở chat window

## 💬 Cách Sử Dụng Widget

### Cho Khách Hàng (Website Visitor)

1. Click nút chat (💬) ở góc dưới phải
2. Nhập tên và email (nếu được yêu cầu)
3. Gửi tin nhắn
4. AI sẽ tự động trả lời (nếu được bật)
5. Admin của bạn sẽ nhận được tin nhắn trong real-time

### Cho Business (Admin Dashboard)

1. Mở dashboard → Chat
2. Bạn sẽ thấy conversations từ tất cả platforms (Facebook, Instagram, Telegram, **Widget**)
3. Click vào conversation để xem chi tiết
4. Gửi tin nhắn trực tiếp cho khách hàng
5. Bật/tắt AI response nếu cần

## 🔒 Bảo Mật

### Widget Secret

- **Widget ID**: Công khai, được hiển thị trên website
- **Widget Secret**: Bí mật, chỉ được lưu trên server
  - ⚠️ Không bao giờ chia sẻ widget_secret với khách hàng
  - Widget secret được truyền an toàn qua postMessage, không qua URL

### Origin Validation

- Backend kiểm tra origin của mỗi request
- Chỉ chấp nhận request từ các domain được phép
- Nếu khách hàng thêm domain sai, widget sẽ không hoạt động

### Thiết Lập CORS

Đảm bảo backend của bạn cho phép:

- Origin: `https://customer-website.com`
- Methods: `POST, OPTIONS`
- Headers: `widget-id, widget-secret, origin, content-type`

## 📊 Quản Lý Widgets

### Xem Danh Sách Widgets

```
GET /api/widgets/list (Cần implement - optional)
```

### Cập Nhật Allowed Origins

```
PUT /api/widgets/{widget_id} (Cần implement - optional)
Body: { allowed_origins: ["https://example.com"] }
```

### Xóa Widget

```
DELETE /api/widgets/{widget_id} (Cần implement - optional)
```

## 🐛 Troubleshooting

### Widget không hiển thị

1. Kiểm tra embed code có đúng không
2. Kiểm tra API URL có chính xác không
3. Mở DevTools → Console, xem có lỗi gì không
4. Kiểm tra domain có trong Allowed Origins không

### Tin nhắn không được gửi

1. Kiểm tra network requests trong DevTools
2. Kiểm tra widget_secret có chính xác không
3. Kiểm tra origin của request
4. Kiểm tra backend logs

### AI Response không hoạt động

1. Kiểm tra cấu hình AI service
2. Kiểm tra `is_ai_enabled` trong conversation
3. Kiểm tra Milvus/embedding service có chạy không

## 📈 Thống Kê & Analytics

Dashboard sẽ hiển thị:

- Số lượng conversations từ widget
- Số lượng tin nhắn
- Response time trung bình
- Customer satisfaction (nếu có feedback)

## 🔧 API Endpoints

### Tạo Widget

```bash
POST /api/widgets/create
Authorization: Bearer {token}
Content-Type: application/json

{
  "allowed_origins": [
    "https://example.com",
    "https://www.example.com"
  ]
}

Response:
{
  "widget_id": "abc123...",
  "widget_secret": "xyz789...",
  "allowed_origins": ["https://example.com"],
  "embed_script_url": "https://your-api.com/embed.js?id=abc123"
}
```

### Lấy Config Widget

```bash
GET /api/widgets/{widget_id}
Authorization: Bearer {token}
```

### Gửi Tin Nhắn (Public)

```bash
POST /api/widgets/send
Headers:
  - widget-id: {widget_id}
  - widget-secret: {widget_secret}
  - origin: {customer_website_origin}
Content-Type: application/json

{
  "visitor_id": "visitor_123",
  "visitor_name": "Khách hàng",
  "visitor_email": "customer@example.com",
  "visitor_phone": "+84912345678",
  "message_text": "Xin chào"
}

Response:
{
  "status": "ok",
  "conversation_id": "conv_uuid",
  "message_id": "msg_uuid",
  "ai_response": "Xin chào! Tôi có thể giúp gì cho bạn?" // (nếu AI enabled)
}
```

## 📱 WebSocket for Real-time Updates

Admin dashboard nhận updates qua WebSocket:

```
WS /ws/{business_id}

Message format:
{
  "type": "new_message",
  "conversation_id": "conv_uuid",
  "message": {
    "id": "msg_uuid",
    "sender_type": "contact" | "ai" | "business",
    "content": "Message text",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "contact": {
    "id": "contact_uuid",
    "display_name": "Visitor Name",
    "platform": "widget",
    "visitor_email": "customer@example.com"
  }
}
```

## 🎯 Best Practices

1. **Tên Business Rõ Ràng**
   - Sử dụng tên dễ nhận diện (VD: "Customer Support", "Sales Team")

2. **Allowed Origins Chính Xác**
   - Thêm cả `http://localhost` nếu test local
   - Thêm cả `https://` và non-www versions nếu cần

3. **AI Configuration**
   - Enable AI nếu có knowledge base setup
   - Disable nếu chỉ muốn manual responses

4. **Monitor Performance**
   - Kiểm tra response time
   - Kiểm tra failed messages

5. **Customer Experience**
   - Test widget trên mobile
   - Test trên các browser khác nhau

## 📞 Support

- **Lỗi Backend**: Kiểm tra `backend/main.py` logs
- **Lỗi Frontend**: Mở DevTools → Console
- **Database Issues**: Kiểm tra PostgreSQL connection

## 🔄 Cập Nhật Hướng Dẫn

Lần cập nhật cuối: May 9, 2024
Các tính năng sắp tới:

- [ ] Widget analytics dashboard
- [ ] Custom styling options
- [ ] Multiple language support
- [ ] Chatbot handoff to human agent
