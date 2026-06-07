# ChatDesk - đọc luồng UI, backend và Milvus cho người mới vào dự án

Tài liệu này viết theo góc nhìn một lập trình viên mới tham gia dự án và đang tập đọc code. Mục tiêu không phải là liệt kê từng dòng code, mà là giúp bạn nhìn được “người dùng bấm gì trên UI, frontend gọi gì, backend xử lý ở đâu, dữ liệu đi vào PostgreSQL/Milvus/WebSocket như thế nào”.

## 1. Bức tranh tổng quan

ChatDesk là hệ thống CRM quản lý hội thoại khách hàng đa kênh. Các kênh hiện có gồm Facebook, Instagram, Telegram và Widget nhúng website.

Luồng lớn của hệ thống:

1. Frontend web hoặc mobile hiển thị UI cho business/employee/admin.
2. UI gọi API qua `frontend/src/api/client.js` hoặc `mobile/src/api/client.js`.
3. Backend FastAPI nhận request qua các router trong `backend/app/api`.
4. PostgreSQL lưu dữ liệu chính: user, channel, contact, conversation, message, product, label, employee, saved reply, assignment.
5. Milvus lưu vector embedding của sản phẩm để AI tìm sản phẩm liên quan khi khách hỏi.
6. WebSocket đẩy realtime message/typing/label update về dashboard.
7. LLM provider tạo câu trả lời AI dựa trên dữ liệu cửa hàng, lịch sử hội thoại và sản phẩm lấy từ Milvus.

Nếu đọc code lần đầu, nên đi theo thứ tự này:

1. `frontend/src/App.jsx`: biết route nào ứng với màn nào và role nào được vào.
2. `frontend/src/components/Layout.jsx`: biết menu, header, WebSocket dashboard.
3. `frontend/src/api/client.js`: biết request gắn token/ngôn ngữ như thế nào.
4. `frontend/src/store/*.js` và từng page trong `frontend/src/pages`: biết UI gọi endpoint nào.
5. `backend/main.py`: biết backend mount router và WebSocket.
6. `backend/app/api/*.py`: biết endpoint xử lý request.
7. `backend/app/services/*.py`: biết logic nghiệp vụ, AI, Milvus, kênh ngoài.
8. `backend/app/models/*.py`: biết bảng dữ liệu.

## 2. Role và route trên web UI

File chính: `frontend/src/App.jsx`.

Hệ thống hiện có 3 nhóm người dùng:

- `admin`: xem toàn hệ thống, danh sách doanh nghiệp, chi tiết doanh nghiệp.
- `business`: chủ doanh nghiệp/cửa hàng, quản lý kênh, sản phẩm, nhân viên, nhãn, phân công, thống kê, profile.
- `employee`: nhân viên CSKH, chủ yếu xử lý chat, dùng saved replies và chỉnh thông tin cá nhân.

Các route chính:

- `/login`: đăng nhập.
- `/register`: đăng ký tài khoản business.
- `/widget`: trang public chạy widget chat.
- `/chat`: inbox hội thoại, business và employee dùng chung.
- `/channels`: kết nối Facebook/Instagram/Telegram và quản lý Widget.
- `/products`: quản lý sản phẩm, đây là màn liên quan trực tiếp đến Milvus.
- `/labels`: quản lý nhãn khách hàng/hội thoại.
- `/saved-replies`: mẫu trả lời nhanh.
- `/assignment-settings`: cấu hình phân công hội thoại.
- `/statistics`: thống kê cho business.
- `/employees`: quản lý nhân viên.
- `/settings`: profile doanh nghiệp.
- `/employee-settings`: profile nhân viên.
- `/admin`: thống kê toàn hệ thống.
- `/admin/businesses`: danh sách doanh nghiệp.
- `/admin/businesses/:businessId`: chi tiết doanh nghiệp.

`Layout.jsx` quyết định menu hiển thị theo role. Business có nhiều mục quản trị, employee có ít mục hơn, admin có menu admin riêng.

## 3. API client ở frontend

Web dùng `frontend/src/api/client.js`.

Mỗi request tự gắn:

- `Authorization: Bearer <token>` nếu đã đăng nhập.
- `X-Language` và `Accept-Language` theo ngôn ngữ hiện tại.
- `ngrok-skip-browser-warning`.

Nếu backend trả `401`, client logout và chuyển về `/login`.

Mobile dùng `mobile/src/api/client.js`, ý tưởng giống web nhưng dùng biến môi trường Expo: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`.

## 4. Realtime dashboard

File frontend: `frontend/src/components/Layout.jsx`, `frontend/src/utils/websocket.js`.

Khi business/employee đăng nhập, Layout mở WebSocket tới:

- `/ws/me?token=<jwt>`

Backend xác thực token trong `backend/main.py`, lấy business id hiệu lực:

- business thì dùng chính `user.id`.
- employee thì dùng `user.business_id`.

Các event chính frontend đang nghe:

- `new_message`: thêm message vào store, cập nhật conversation list.
- `ai_typing`: bật/tắt trạng thái AI đang trả lời.
- `contact_labels_updated`: cập nhật nhãn của contact trong inbox.

Widget khách hàng có WebSocket riêng:

- `/ws/widget/{widget_id}?widget_secret=...&conversation_id=...`

Luồng này dùng để business/employee trả lời trên dashboard thì widget của khách nhận realtime.

## 5. Tổng hợp chức năng UI web hiện tại

### 5.1 Đăng nhập và đăng ký

Màn hình:

- `frontend/src/pages/Login.jsx`
- `frontend/src/pages/Register.jsx`

Chức năng:

- Đăng nhập bằng email/password.
- Đăng ký tài khoản business mới với tên doanh nghiệp, email, mật khẩu, số điện thoại.
- Sau login:
  - admin đi vào `/admin`.
  - business/employee đi vào `/chat`.

Backend:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/me`

Router backend: `backend/app/api/auth.py`.

### 5.2 Layout, theme, ngôn ngữ, AI assistant nội bộ

Màn hình/chức năng nằm trong:

- `frontend/src/components/Layout.jsx`
- `frontend/src/components/AIAssistantModal.jsx`

Chức năng:

- Menu điều hướng theo role.
- Logout.
- Đổi ngôn ngữ Việt/Anh.
- Đổi theme sáng/tối.
- Hiển thị avatar/tên business hoặc nhân viên.
- Mở AI assistant nội bộ.

AI assistant nội bộ:

- Xem lịch sử hỏi đáp.
- Hỏi về sản phẩm/dữ liệu cửa hàng/cách dùng ChatDesk.
- Nếu đang mở một conversation, có thể yêu cầu tóm tắt hội thoại hiện tại.
- Xóa lịch sử hỏi đáp của chính user.

Backend:

- `GET /api/ai-assistant/history`
- `POST /api/ai-assistant/ask`
- `DELETE /api/ai-assistant/history`

Luồng service:

- `backend/app/api/ai_assistant.py`
- `backend/app/services/ai_assistant_service.py`

AI assistant nội bộ không tự gửi tin ra Facebook/Instagram/Telegram/Widget. Nó chỉ tư vấn cho nhân viên trong dashboard.

### 5.3 Chat/Inboxes

Màn hình chính:

- `frontend/src/pages/Chat.jsx`
- `frontend/src/store/chatStore.js`

Chức năng hiện có:

- Xem danh sách hội thoại.
- Lọc hội thoại theo:
  - từ khóa khách hàng,
  - trạng thái phân công: tất cả/chưa phân công/đã phân công,
  - nhãn,
  - nền tảng: Facebook, Instagram, Telegram, Widget.
- Chọn hội thoại để xem tin nhắn.
- Cache tin nhắn một số conversation để chuyển qua lại nhanh hơn.
- Load thêm tin nhắn cũ bằng cursor khi kéo lên.
- Đánh dấu đã đọc khi mở hội thoại.
- Gửi tin nhắn text.
- Gửi file/ảnh đính kèm.
- Xem ảnh đính kèm dạng preview.
- Dùng emoji picker.
- Dùng quick reply bằng cách gõ `/shortcut`.
- Bật/tắt AI tự động trả lời trên từng conversation.
- Mở panel chi tiết conversation.
- Phân công conversation cho business hoặc nhân viên.
- Gắn/gỡ nhãn cho contact.
- Xem thông tin visitor/widget như email, phone nếu có.
- Xem lịch sử tạo conversation, phân công, gắn/gỡ nhãn.
- Nhận realtime tin nhắn mới và trạng thái AI typing qua WebSocket.

Backend hay được gọi:

- `GET /api/conversations`
- `GET /api/conversations/{conversation_id}`
- `GET /api/conversations/{conversation_id}/messages`
- `POST /api/conversations/{conversation_id}/read`
- `POST /api/conversations/{conversation_id}/messages`
- `POST /api/conversations/{conversation_id}/messages/upload`
- `PATCH /api/conversations/{conversation_id}/ai`
- `PATCH /api/conversations/{conversation_id}/assignee`
- `GET /api/conversations/{conversation_id}/history`
- `POST /api/contacts/{contact_id}/labels`
- `DELETE /api/contacts/{contact_id}/labels/{label_id}`
- `GET /api/saved-replies`
- `GET /api/labels`
- `GET /api/assignments/assignees`
- `GET /api/assignments/settings`

Router backend:

- `backend/app/api/conversations.py`
- `backend/app/api/messages.py`
- `backend/app/api/contacts.py`

Điểm cần chú ý khi đọc:

- Employee chỉ thấy conversation được assign cho mình.
- Nếu business bật khóa phân công nhân viên, employee không được đổi assignee.
- `messages.py` chịu trách nhiệm gửi tin ra kênh thật. Với Facebook/Instagram/Telegram thì gọi API nền tảng; với Widget thì đẩy WebSocket về widget.

### 5.4 Kênh liên lạc và Widget

Màn hình:

- `frontend/src/pages/Channels.jsx`
- `frontend/src/components/WidgetManager.jsx`

Chức năng:

- Xem danh sách channel Facebook/Instagram/Telegram đã kết nối.
- Kết nối Meta qua OAuth. Khi thành công backend lưu Facebook Page và Instagram account liên kết.
- Kết nối Telegram bằng bot token, backend kiểm tra bot và set webhook.
- Ngắt kết nối channel.
- Tạo Widget mới cho website.
- Xem danh sách widget.
- Copy Widget ID.
- Copy đoạn embed code.
- Xóa widget.
- Cấu hình allowed origins cho widget.

Backend:

- `GET /api/channels`
- `GET /api/channels/facebook/oauth`
- `GET /api/channels/facebook/callback`
- `POST /api/channels/telegram/connect`
- `DELETE /api/channels/{channel_id}`
- `GET /api/widgets/list`
- `POST /api/widgets/create`
- `DELETE /api/widgets/{widget_id}`

Router/service:

- `backend/app/api/channels.py`
- `backend/app/api/widgets.py`
- `backend/app/services/oauth_service.py`
- `backend/app/services/telegram_service.py`
- `backend/app/services/widget_service.py`

### 5.5 Products - nơi dữ liệu đi vào Milvus

Màn hình:

- `frontend/src/pages/Products.jsx`

Chức năng:

- Xem danh sách sản phẩm.
- Tìm kiếm theo tên/SKU.
- Lọc theo trạng thái còn hàng/hết hàng.
- Lọc theo danh mục.
- Lọc theo khoảng giá.
- Tùy chỉnh cột hiển thị và lưu lựa chọn vào localStorage.
- Thêm sản phẩm.
- Sửa sản phẩm.
- Xóa một sản phẩm.
- Xóa toàn bộ sản phẩm.
- Import JSON tối đa theo giới hạn backend.

Backend:

- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/{product_id}`
- `DELETE /api/products/{product_id}`
- `DELETE /api/products`
- `POST /api/products/import`

Router: `backend/app/api/products.py`.

Đây là màn quan trọng nhất nếu bạn muốn hiểu Milvus:

- Khi tạo sản phẩm, backend lưu row vào PostgreSQL, sau đó build một đoạn text từ tên, SKU, danh mục, mô tả, giá, tồn kho, trạng thái và extra info.
- Text đó được đưa qua `get_embedding()` trong `backend/app/services/embedding_service.py`.
- Embedding được `upsert_embedding()` vào Milvus trong collection `product_embeddings`.
- Khi sửa sản phẩm, backend tạo embedding mới và upsert lại cùng `product_id`.
- Khi xóa sản phẩm, backend gọi `delete_embedding(product_id)` để xóa vector tương ứng khỏi Milvus.
- Khi xóa toàn bộ, backend lặp từng sản phẩm và xóa embedding.

### 5.6 Labels

Màn hình:

- `frontend/src/pages/Labels.jsx`

Chức năng:

- Xem danh sách nhãn.
- Tìm kiếm nhãn.
- Tạo nhãn với tên, màu, ghi chú nội bộ.
- Xem preview nhãn.
- Sửa nhãn.
- Xóa nhãn.
- Bật cấu hình AI tự gắn nhãn khi hội thoại đã đủ thông tin chốt đơn/order ready.

Backend:

- `GET /api/labels`
- `POST /api/labels`
- `PUT /api/labels/{label_id}`
- `DELETE /api/labels/{label_id}`

Router/service liên quan:

- `backend/app/api/labels.py`
- `backend/app/services/ai_order_label_service.py`
- `backend/app/services/order_readiness_service.py`

Điểm đáng chú ý:

- Nhãn không chỉ để lọc UI. Nhãn còn có thể ảnh hưởng auto assignment nếu cấu hình rule theo label.
- Nhãn có `ai_auto_apply_trigger = order_ready` sẽ được AI service dùng để tự gắn nhãn khi phát hiện khách đã sẵn sàng chốt đơn.

### 5.7 Saved Replies

Màn hình:

- `frontend/src/pages/SavedReplies.jsx`

Chức năng:

- Xem danh sách mẫu trả lời.
- Tìm kiếm mẫu trả lời.
- Tạo mẫu trả lời.
- Sửa mẫu trả lời.
- Xóa mẫu trả lời.
- Business tạo mẫu scope `business`.
- Employee tạo mẫu scope `personal`.
- Trong màn Chat, gõ `/shortcut` để gọi nhanh mẫu trả lời.

Backend:

- `GET /api/saved-replies`
- `POST /api/saved-replies`
- `PUT /api/saved-replies/{reply_id}`
- `DELETE /api/saved-replies/{reply_id}`

Router: `backend/app/api/saved_replies.py`.

### 5.8 Assignment settings

Màn hình:

- `frontend/src/pages/AssignmentSettings.jsx`

Chức năng:

- Xem số conversation chưa phân công.
- Xem số conversation assign về business.
- Xem tổng conversation.
- Xem số conversation đang assign cho từng employee.
- Bật/tắt khóa quyền employee tự đổi phân công.
- Bật/tắt auto assignment.
- Chọn chiến lược auto assignment:
  - round robin,
  - least active.
- Cấu hình rule phân công theo kênh: Facebook/Instagram/Telegram/Widget.
- Cấu hình rule phân công theo nhãn.
- Refresh dữ liệu trung tâm phân công.

Backend:

- `GET /api/assignments/settings`
- `PATCH /api/assignments/settings`
- `GET /api/assignments/overview`
- `GET /api/assignments/assignees`
- `GET /api/labels`

Router/service:

- `backend/app/api/assignments.py`
- `backend/app/services/assignment_service.py`

Luồng auto assignment xảy ra khi backend tạo conversation mới từ webhook/widget, hoặc khi gắn label cho contact. Nếu auto assignment đang bật, service sẽ chọn employee theo rule label trước, rule channel sau, cuối cùng fallback về danh sách employee active.

### 5.9 Employees

Màn hình:

- `frontend/src/pages/Employees.jsx`

Chức năng:

- Xem danh sách nhân viên.
- Tìm kiếm nhân viên.
- Tạo employee với họ tên, email, mật khẩu tạm.
- Sửa họ tên/email.
- Đổi mật khẩu employee từ phía business.
- Khóa/mở khóa employee.
- Xóa employee.

Backend:

- `GET /api/employees`
- `POST /api/employees`
- `PATCH /api/employees/{employee_id}/profile`
- `PATCH /api/employees/{employee_id}/password`
- `PATCH /api/employees/{employee_id}`
- `DELETE /api/employees/{employee_id}`

Router: `backend/app/api/employees.py`.

### 5.10 Business settings

Màn hình:

- `frontend/src/pages/Settings.jsx`

Chức năng:

- Xem email business.
- Cập nhật tên doanh nghiệp.
- Cập nhật mô tả cửa hàng.
- Cập nhật số điện thoại/hotline.
- Cập nhật địa chỉ, giờ mở cửa.
- Cập nhật chính sách giao hàng.
- Cập nhật chính sách bảo hành/đổi trả.
- Cập nhật phương thức thanh toán.
- Upload avatar/logo doanh nghiệp.

Backend:

- `PUT /api/users/profile`
- `POST /api/users/profile/avatar`

Router: `backend/app/api/users.py`.

Các thông tin này cũng được đưa vào prompt AI để trả lời khách chính xác hơn về cửa hàng.

### 5.11 Employee settings

Màn hình:

- `frontend/src/pages/EmployeeSettings.jsx`

Chức năng:

- Employee tự cập nhật họ tên/email.
- Employee đổi mật khẩu cá nhân với mật khẩu hiện tại.

Backend:

- `PATCH /api/employees/me/profile`
- `PATCH /api/employees/me/password`

### 5.12 Business statistics

Màn hình:

- `frontend/src/pages/Statistics.jsx`

Chức năng:

- Chọn khoảng thời gian 7/14/30/90 ngày.
- Xem tổng conversation, contact, message, AI message.
- Xem open conversation, unassigned conversation, thời gian phản hồi đầu tiên trung bình.
- Biểu đồ volume conversation/message theo ngày.
- Phân bổ theo platform.
- Thống kê assignment.
- Thống kê channel.
- Thống kê sender type.
- Top labels.

Backend:

- `GET /api/statistics/business?days=...`

Router: `backend/app/api/statistics.py`.

### 5.13 Admin analytics và business directory

Màn hình:

- `frontend/src/pages/AdminAnalytics.jsx`
- `frontend/src/pages/AdminBusinessDirectory.jsx`
- `frontend/src/pages/AdminBusinessDetail.jsx`

Chức năng admin analytics:

- Chọn 7/14/30/90 ngày.
- Xem tổng business, active business, channel, message, conversation, contact, product, AI usage.
- Xem volume toàn hệ thống.
- Xem platform usage.
- Xem sender mix.
- Xem top business theo conversation.
- Xem top business theo AI usage.
- Click vào business để xem chi tiết.

Chức năng business directory:

- Tìm kiếm business.
- Lọc active/inactive.
- Sắp xếp theo thời gian tạo, conversation, message, AI, channel, product.
- Xem số channel, employee, conversation, message, AI message, product của từng business.

Chức năng business detail:

- Xem thông tin tổng quan business.
- Xem trạng thái account/channel.
- Xem thống kê channel, employee, conversation, message, contact, product, AI.
- Xem platform usage, assignment overview, product status.
- Xem danh sách channel.
- Xem danh sách employee.
- Xem recent conversations.

Backend:

- `GET /api/admin/analytics`
- `GET /api/admin/businesses`
- `GET /api/admin/businesses/{business_id}`
- `GET /api/admin/statistics`

Router: `backend/app/api/admin.py`.

Admin không trực tiếp thao tác Milvus trên UI hiện tại. Admin chỉ xem số liệu/tình trạng business.

### 5.14 Widget public

Màn hình:

- `frontend/src/pages/WidgetPage.jsx`
- `frontend/src/components/WidgetChat.jsx`
- `frontend/public/embed.js`

Chức năng:

- Website bên ngoài nhúng widget bằng embed code.
- Widget nhận `widgetId`, `widgetSecret`, `apiUrl` từ cấu hình.
- Visitor nhập tên và email.
- Gửi tin nhắn text.
- Gửi file/ảnh.
- Lưu visitor info vào localStorage.
- Với returning visitor, widget gọi history để khôi phục hội thoại.
- Mở WebSocket widget sau khi có `conversation_id`.
- Nhận realtime tin business/employee/AI trả về.
- Gửi tín hiệu đóng widget về parent window khi chạy trong iframe.

Backend:

- `GET /api/widgets/{widget_id}/history`
- `GET /api/widgets/{widget_id}/messages`
- `POST /api/widgets/send`
- `POST /api/widgets/send-file`
- `/ws/widget/{widget_id}`

Đây là một đường vào chính của khách hàng, song song với Facebook/Instagram/Telegram webhook.

## 6. Mobile UI hiện tại

Mobile nằm trong thư mục `mobile/`. Stack chính ở `mobile/App.js`.

Các màn mobile:

- `LoginScreen`
- `RegisterScreen`
- `ConversationListScreen`
- `ChatScreen`
- `ChannelsScreen`
- `EmployeesScreen`
- `ProductsScreen`
- `AssignmentCenterScreen`
- `SavedRepliesScreen`
- `LabelsScreen`
- `StatisticsScreen`
- `AccountSettingsScreen`
- `MenuScreen`

Mobile dùng cùng backend API với web. Các chức năng chính đang mirror web:

- đăng nhập/đăng ký,
- danh sách conversation,
- chat,
- bật/tắt AI,
- phân công,
- gắn/gỡ label,
- xem lịch sử hội thoại,
- quản lý channels,
- quản lý products,
- quản lý assignment,
- quản lý saved replies,
- quản lý labels,
- thống kê,
- settings tài khoản,
- AI assistant dạng bubble.

Điểm riêng của mobile:

- Có đăng ký push notification qua `mobile/src/notifications.js`.
- Khi user bấm notification, app mở conversation tương ứng.
- API client mobile lấy URL từ `EXPO_PUBLIC_API_URL`.

## 7. Luồng sản phẩm đi từ UI sang Milvus

Đây là luồng nên đọc kỹ nếu muốn hiểu AI trả lời sản phẩm.

### 7.1 Thêm sản phẩm

1. Business mở `/products`.
2. UI submit form thêm sản phẩm.
3. Frontend gọi `POST /api/products`.
4. Backend `backend/app/api/products.py` tạo `Product` trong PostgreSQL.
5. Backend build text mô tả sản phẩm từ các field chính.
6. Backend gọi `get_embedding(text)`.
7. `embedding_service.py` dùng model sentence-transformers để tạo vector 384 chiều.
8. Backend gọi `upsert_embedding(product_id, business_id, embedding)`.
9. `milvus_service.py` ghi vector vào collection `product_embeddings`.

### 7.2 Sửa sản phẩm

1. UI gọi `PUT /api/products/{product_id}`.
2. Backend cập nhật Product trong PostgreSQL.
3. Backend build lại text.
4. Backend tạo embedding mới.
5. Backend upsert lại vào Milvus với cùng `product_id`.

### 7.3 Xóa sản phẩm

1. UI gọi `DELETE /api/products/{product_id}` hoặc `DELETE /api/products`.
2. Backend xóa embedding bằng `delete_embedding(product_id)`.
3. Backend xóa row Product trong PostgreSQL.

### 7.4 Import JSON

1. UI đọc file JSON trên trình duyệt.
2. UI gửi danh sách sản phẩm lên `POST /api/products/import`.
3. Backend tạo từng sản phẩm.
4. Với mỗi sản phẩm, backend cố gắng tạo embedding và upsert vào Milvus.
5. Nếu embedding một sản phẩm lỗi, backend log warning và vẫn tiếp tục import các sản phẩm khác.

### 7.5 Milvus collection

File: `backend/app/services/milvus_service.py`.

Collection hiện tại:

- Tên: `product_embeddings`.
- Primary key: `id`, chính là `product_id`.
- Field filter: `business_id`.
- Vector field: `embedding`.
- Dimension: `384`.
- Metric: `COSINE`.
- Index: `AUTOINDEX`.

Ý nghĩa:

- Một sản phẩm trong PostgreSQL tương ứng một vector trong Milvus.
- Khi search, backend luôn filter theo `business_id` để không lấy nhầm sản phẩm của business khác.

## 8. Luồng khách nhắn tin vào hệ thống

Có 2 nhóm đường vào:

- Kênh ngoài: Facebook, Instagram, Telegram qua webhook.
- Widget: khách nhắn từ widget website.

### 8.1 Facebook/Instagram/Telegram webhook

File backend:

- `backend/app/api/webhooks.py`

Luồng:

1. Nền tảng gửi webhook về backend.
2. Backend xác định platform và channel.
3. Backend tìm active channel theo `platform` và `platform_page_id`.
4. Backend tìm hoặc tạo contact.
5. Backend tìm hoặc tạo conversation.
6. Nếu conversation mới, backend gọi `auto_assign_conversation()`.
7. Backend lưu message của khách vào PostgreSQL.
8. Backend commit để dashboard refetch thấy dữ liệu mới.
9. Backend gửi `new_message` qua WebSocket cho dashboard.
10. Backend gửi push notification cho mobile nếu có token.
11. Nếu conversation bật AI và message không phải attachment, backend gọi `generate_ai_response()`.
12. AI tạo câu trả lời.
13. Backend gửi câu trả lời AI ra lại nền tảng tương ứng.
14. Backend lưu AI message vào PostgreSQL.
15. Backend gửi `new_message` qua WebSocket cho dashboard.
16. Backend kiểm tra order-ready label nếu có cấu hình.
17. Nếu cần, backend tự gắn nhãn, có thể auto assign theo label và gửi thêm handoff message.

### 8.2 Widget

File backend:

- `backend/app/api/widgets.py`

Luồng:

1. Visitor nhập tên/email trong widget.
2. Visitor gửi text hoặc file.
3. Widget gọi `POST /api/widgets/send` hoặc `POST /api/widgets/send-file`.
4. Backend validate `widget_id` và `widget_secret`.
5. Backend tìm channel widget active.
6. Backend tìm hoặc tạo contact widget.
7. Backend tìm hoặc tạo conversation widget.
8. Nếu conversation mới, backend gọi auto assignment.
9. Backend lưu message khách.
10. Backend gửi `new_message` cho dashboard qua WebSocket.
11. Nếu text message và AI đang bật, backend gọi `generate_ai_response()`.
12. Backend lưu AI message.
13. Backend gửi AI message cho dashboard và trả về response cho widget.
14. Widget cũng mở WebSocket riêng để nhận các tin về sau từ business/employee.

Khác với Facebook/Instagram/Telegram, widget không cần gửi tin ra API nền tảng. Backend chỉ trả response cho widget và đẩy WebSocket.

## 9. Luồng AI trả lời khách và Milvus

File chính:

- `backend/app/services/ai_service.py`
- `backend/app/services/milvus_service.py`
- `backend/app/services/embedding_service.py`
- `backend/app/services/llm_service.py`
- `backend/app/services/ai_scope_service.py`

Khi khách hỏi một câu, backend gọi:

- `generate_ai_response(db, conversation, user_message)`

Luồng hiện tại:

1. Lấy lịch sử chat gần nhất của conversation.
2. Chạy `classify_ai_scope()` để xem AI có nên trả lời không.
3. Nếu ngoài phạm vi, AI trả câu từ chối/hướng khách về phạm vi hỗ trợ.
4. Nếu là greeting, AI trả greeting ngắn.
5. Tạo embedding cho `user_message`.
6. Search Milvus theo `business_id`.
7. Milvus trả danh sách product id kèm score.
8. Backend đánh giá độ tin cậy của search hiện tại:
   - top score có đủ cao không,
   - khoảng cách top1/top2 có đủ không hoặc có nhiều kết quả đạt min score không,
   - message có đủ dài không.
9. Nếu search hiện tại đủ tin cậy, backend fetch product rows từ PostgreSQL theo product id Milvus trả về.
10. Nếu search hiện tại chưa đủ tin cậy, backend có thể gọi LLM rewrite để biến câu follow-up mơ hồ thành query độc lập.
11. Nếu rewrite đủ confidence, backend search Milvus lại bằng query rewrite.
12. Backend lọc product context theo min score.
13. Backend lấy thông tin business profile.
14. Backend build prompt gồm:
   - thông tin cửa hàng,
   - query dùng để search,
   - product context,
   - lịch sử hội thoại,
   - câu hỏi hiện tại.
15. Backend gọi LLM provider hiện tại.
16. Backend trả text cho caller để router lưu message và gửi ra kênh.

Điểm quan trọng:

- Milvus chỉ trả id và score, không phải toàn bộ sản phẩm.
- Backend vẫn phải query PostgreSQL để lấy chi tiết sản phẩm.
- Search luôn filter `business_id`.
- Prompt nhắc AI không được bịa sản phẩm, giá, tồn kho, chính sách nếu không có dữ liệu.
- Nếu không có product context phù hợp, AI được hướng dẫn nói rõ là không tìm thấy dữ liệu sản phẩm phù hợp trong hệ thống.

## 10. Luồng nhân viên/business trả lời khách

File frontend:

- `frontend/src/pages/Chat.jsx`
- `frontend/src/store/chatStore.js`

File backend:

- `backend/app/api/messages.py`

Luồng gửi text:

1. User nhập tin trong Chat UI.
2. `chatStore.sendMessage()` gọi `POST /api/conversations/{id}/messages`.
3. Backend kiểm tra user có quyền gửi trong conversation không.
4. Backend gửi message ra platform:
   - Facebook: `send_facebook_message`.
   - Instagram: `send_instagram_message`.
   - Telegram: `send_telegram_message`.
   - Widget: không gọi platform API, sẽ gửi qua WebSocket widget sau khi lưu.
5. Backend lưu message sender_type `business`.
6. Backend cập nhật `conversation.last_message_at`.
7. Backend gửi WebSocket dashboard.
8. Nếu là widget conversation, backend gửi thêm WebSocket tới key widget.

Luồng gửi file tương tự, nhưng frontend dùng FormData và backend gọi `save_upload_file()` trước khi gửi platform attachment.

## 11. Luồng AI assistant nội bộ

AI assistant nội bộ khác AI trả lời khách.

File frontend:

- `frontend/src/components/AIAssistantModal.jsx`
- `mobile/src/components/AIAssistantBubble.js`

File backend:

- `backend/app/api/ai_assistant.py`
- `backend/app/services/ai_assistant_service.py`

Luồng hỏi đáp:

1. User mở AI assistant.
2. Frontend load lịch sử bằng `GET /api/ai-assistant/history`.
3. User gửi câu hỏi qua `POST /api/ai-assistant/ask`.
4. Backend xác định business id hiệu lực.
5. Nếu có `conversation_id`, backend kiểm tra user được quyền xem conversation đó.
6. Service lấy business profile.
7. Service lấy lịch sử hỏi đáp assistant gần đây.
8. Nếu có conversation đang mở, service lấy vài tin nhắn gần nhất làm context.
9. Service phân loại scope.
10. Service retrieval sản phẩm. Ở internal assistant, nếu Milvus lỗi hoặc không có kết quả, service có fallback lấy một số sản phẩm mới nhất.
11. Service build prompt cho nhân viên.
12. LLM trả lời.
13. Backend lưu cả user message và assistant message vào `AIAssistantMessage`.

Luồng tóm tắt hội thoại:

1. User bấm nút tóm tắt conversation đang mở.
2. Frontend gửi intent `summarize_conversation`.
3. Backend lấy nhiều tin nhắn gần nhất của conversation.
4. LLM tóm tắt theo nhu cầu khách, nội dung đã trao đổi, vấn đề còn mở, bước tiếp theo.

## 12. Luồng nhãn tự động khi khách sẵn sàng chốt đơn

File:

- `frontend/src/pages/Labels.jsx`
- `backend/app/services/ai_order_label_service.py`
- `backend/app/services/order_readiness_service.py`

Ý tưởng:

1. Business tạo label và bật trigger `order_ready`.
2. Khi AI trả lời khách xong, backend gọi `apply_order_ready_labels_if_needed()`.
3. Service lấy các label có trigger order-ready.
4. Service lấy lịch sử message gần nhất.
5. `detect_order_readiness()` đánh giá khách đã đủ thông tin chốt đơn chưa.
6. Nếu đủ, service gắn label vào contact.
7. Service ghi lịch sử label vào `ConversationLabelHistory`.
8. Service gọi auto assignment theo label nếu cần.
9. Service gửi WebSocket `contact_labels_updated` để UI cập nhật nhãn ngay.
10. Nếu cần handoff, backend gửi thêm một AI message nhắc chuyển cho nhân viên.

## 13. Bảng endpoint đọc nhanh theo màn hình

| Màn hình | Endpoint chính |
| --- | --- |
| Login/Register | `/api/auth/login`, `/api/auth/register`, `/api/auth/me` |
| Chat list | `/api/conversations`, `/api/conversations/{id}` |
| Messages | `/api/conversations/{id}/messages`, `/api/conversations/{id}/messages/upload` |
| Read state | `/api/conversations/{id}/read` |
| AI toggle | `/api/conversations/{id}/ai` |
| Assign conversation | `/api/conversations/{id}/assignee` |
| Conversation history | `/api/conversations/{id}/history` |
| Contact labels | `/api/contacts/{id}/labels`, `/api/contacts/{id}/labels/{label_id}` |
| Channels | `/api/channels`, `/api/channels/facebook/oauth`, `/api/channels/telegram/connect` |
| Widgets | `/api/widgets/list`, `/api/widgets/create`, `/api/widgets/send`, `/api/widgets/send-file` |
| Products | `/api/products`, `/api/products/import` |
| Labels | `/api/labels` |
| Saved replies | `/api/saved-replies` |
| Assignments | `/api/assignments/settings`, `/api/assignments/overview`, `/api/assignments/assignees` |
| Employees | `/api/employees`, `/api/employees/me/profile`, `/api/employees/me/password` |
| Business settings | `/api/users/profile`, `/api/users/profile/avatar` |
| Business statistics | `/api/statistics/business` |
| Internal AI assistant | `/api/ai-assistant/history`, `/api/ai-assistant/ask` |
| Admin | `/api/admin/analytics`, `/api/admin/businesses`, `/api/admin/businesses/{id}` |
| Webhooks | `/api/webhooks/facebook`, `/api/webhooks/instagram`, `/api/webhooks/meta`, `/api/webhooks/telegram/{bot_id}` |

## 14. File map nên mở khi debug

Frontend web:

- `frontend/src/App.jsx`: route và role guard.
- `frontend/src/components/Layout.jsx`: menu, realtime WebSocket, theme/language.
- `frontend/src/api/client.js`: axios client.
- `frontend/src/store/authStore.js`: login/register/me/logout.
- `frontend/src/store/chatStore.js`: conversation/message state.
- `frontend/src/store/channelStore.js`: channels.
- `frontend/src/pages/Chat.jsx`: UI inbox.
- `frontend/src/pages/Products.jsx`: UI sản phẩm.
- `frontend/src/components/WidgetChat.jsx`: widget public.
- `frontend/src/components/AIAssistantModal.jsx`: AI assistant nội bộ.

Mobile:

- `mobile/App.js`: navigation stack.
- `mobile/src/api/client.js`: axios client mobile.
- `mobile/src/store/chatStore.js`: conversation/message mobile.
- `mobile/src/components/AIAssistantBubble.js`: AI assistant mobile.
- `mobile/src/notifications.js`: push notification.

Backend:

- `backend/main.py`: mount router, WebSocket, startup Milvus/embedding.
- `backend/app/api/products.py`: sản phẩm và Milvus upsert/delete.
- `backend/app/services/milvus_service.py`: connect/search/upsert/delete Milvus.
- `backend/app/services/embedding_service.py`: tạo embedding.
- `backend/app/services/ai_service.py`: AI trả lời khách + RAG.
- `backend/app/api/webhooks.py`: tin từ Facebook/Instagram/Telegram.
- `backend/app/api/widgets.py`: tin từ widget.
- `backend/app/api/messages.py`: nhân viên/business gửi tin ra kênh.
- `backend/app/api/conversations.py`: list/filter/read/assign/toggle AI/history.
- `backend/app/services/assignment_service.py`: auto assignment.
- `backend/app/services/ai_assistant_service.py`: AI assistant nội bộ.
- `backend/app/services/ai_order_label_service.py`: AI tự gắn label order-ready.
- `backend/rebuild_milvus.py`: rebuild embedding từ PostgreSQL sang Milvus.

## 15. Cách tự lần một luồng cụ thể

Ví dụ muốn đọc luồng “khách hỏi sản phẩm qua widget và AI trả lời”:

1. Bắt đầu ở `frontend/src/components/WidgetChat.jsx`.
2. Tìm `handleSendMessage()`.
3. Thấy frontend gọi `POST /api/widgets/send`.
4. Mở `backend/app/api/widgets.py`, tìm `send_widget_message()`.
5. Đọc đoạn validate widget, tạo contact, tạo conversation, lưu message.
6. Đọc đoạn `if conversation.is_ai_enabled`.
7. Nhảy sang `backend/app/services/ai_service.py`, đọc `generate_ai_response()`.
8. Đọc `_search_relevant_product_refs()` để thấy tạo embedding và search Milvus.
9. Mở `backend/app/services/milvus_service.py`, đọc `search_similar_with_scores()`.
10. Quay lại `ai_service.py` để thấy backend fetch Product từ PostgreSQL và build prompt.
11. Quay lại `widgets.py` để thấy AI message được lưu và trả về widget/dashboard.

Ví dụ muốn đọc luồng “business thêm sản phẩm để AI biết sản phẩm mới”:

1. Bắt đầu ở `frontend/src/pages/Products.jsx`.
2. Tìm `handleSubmit()`.
3. Thấy frontend gọi `POST /api/products`.
4. Mở `backend/app/api/products.py`, tìm `create_product()`.
5. Đọc `_build_product_text()`.
6. Đọc `get_embedding(text)`.
7. Đọc `upsert_embedding()`.
8. Mở `milvus_service.py` để hiểu collection.

## 16. Một số lưu ý khi đọc code

- PostgreSQL là nguồn dữ liệu chính. Milvus chỉ là index vector để tìm sản phẩm liên quan nhanh và theo ngữ nghĩa.
- Product id trong Milvus chính là id của Product trong PostgreSQL.
- Khi AI cần chi tiết sản phẩm, backend luôn quay lại PostgreSQL lấy row Product.
- WebSocket không thay thế database. WebSocket chỉ đẩy thông báo để UI cập nhật realtime.
- Employee bị giới hạn dữ liệu theo `assigned_to_id`; business thấy toàn bộ dữ liệu của chính business.
- Admin route tách biệt, chủ yếu thống kê và quan sát toàn hệ thống.
- Widget là public endpoint nhưng được bảo vệ bằng `widget_id` và `widget_secret`.
- Ngôn ngữ UI và message lỗi backend được điều khiển bằng header `X-Language`/`Accept-Language`.
- File upload dùng FormData nên API client tự bỏ `Content-Type: application/json`.
- Nếu muốn sửa luồng AI, đọc `ai_service.py` trước rồi mới đọc LLM provider hoặc Milvus.
- Nếu muốn sửa luồng chat thường, đọc `Chat.jsx`, `chatStore.js`, `messages.py`, `webhooks.py`, `widgets.py`.

