# ChatDesk — Omni-channel Chatbot Platform

Nền tảng quản lý tin nhắn tập trung (Omni-channel) giúp doanh nghiệp vừa và nhỏ quản lý tương tác khách hàng từ nhiều nguồn (Facebook, Instagram) trên một giao diện duy nhất, tích hợp AI tự động trả lời dựa trên dữ liệu sản phẩm riêng của từng doanh nghiệp.

---

## 1. Tổng Quan Kiến Trúc

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 18 + Vite)                │
│  Login/Register │ Chat Inbox │ Channels │ Products │ Settings    │
│  Admin Dashboard                                                 │
└────────────────────────────┬─────────────────────────────────────┘
                             │  HTTP (REST) + WebSocket
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI + Python 3.11)               │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────────────┐  │
│  │ Auth API │  │ Chat API │  │ Admin API │  │ Webhook Handler│  │
│  └──────────┘  └──────────┘  └───────────┘  └───────┬────────┘  │
│                                                      │           │
│  ┌──────────────────────────────────────────────┐    │           │
│  │           Services Layer                      │    │           │
│  │  AI Service ← Embedding Service               │    │           │
│  │  Facebook Service / Instagram Service         │    │           │
│  │  OAuth Service / Milvus Service               │    │           │
│  └──────────────────────────────────────────────┘    │           │
└──────┬──────────────┬──────────────┬─────────────────┤───────────┘
       │              │              │                  │
       ▼              ▼              ▼                  ▼
  ┌─────────┐  ┌───────────┐  ┌──────────┐   ┌──────────────────┐
  │PostgreSQL│  │Milvus Cloud│  │ Groq LLM │   │Facebook/Instagram│
  │(Railway) │  │ (Zilliz)  │  │  (API)   │   │   Graph API      │
  └─────────┘  └───────────┘  └──────────┘   └──────────────────┘
```

### Tech Stack

| Layer | Công nghệ | Mục đích |
|---|---|---|
| **Frontend** | React 18, Vite, Ant Design 5, Zustand | SPA, UI components, state management |
| **Backend** | Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic | REST API, async, ORM, migration |
| **Database** | PostgreSQL (Railway) | Dữ liệu quan hệ (users, channels, messages...) |
| **Vector DB** | Milvus Cloud (Zilliz) | Lưu embeddings sản phẩm cho RAG |
| **LLM** | Groq API (`llama-3.3-70b-versatile`) | AI tự động trả lời tin nhắn |
| **Embedding** | `all-MiniLM-L6-v2` (sentence-transformers) | Mã hóa text → vector 384 chiều |
| **Auth** | JWT (python-jose + passlib/bcrypt) | Xác thực stateless |
| **Realtime** | WebSocket (FastAPI native) | Push tin nhắn real-time |
| **Deploy** | Railway (Docker) | Cloud hosting backend + PostgreSQL |

---

## 2. Database Schema

### Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    users     │       │   channels   │       │   contacts   │
│──────────────│       │──────────────│       │──────────────│
│ id (PK,UUID) │◄──┐   │ id (PK,UUID) │       │ id (PK,UUID) │
│ email        │   │   │ business_id  │───┐   │ business_id  │───┐
│ password_hash│   │   │ platform     │   │   │ platform     │   │
│ role         │   │   │ platform_page│   │   │ platform_user│   │
│ business_name│   │   │ page_name    │   │   │ display_name │   │
│ business_desc│   │   │ access_token │   │   │ profile_pic  │   │
│ phone        │   │   │ is_active    │   │   │ created_at   │   │
│ created_at   │   │   │ created_at   │   │   └──────────────┘   │
│ updated_at   │   │   └──────────────┘   │          │            │
└──────────────┘   │          │            │          │            │
       ▲           │          │            │          │            │
       │           │          ▼            ▼          ▼            │
       │           │   ┌──────────────────────────────────┐       │
       │           │   │         conversations            │       │
       │           │   │──────────────────────────────────│       │
       │           └───│ business_id (FK → users)         │◄──────┘
       │               │ channel_id  (FK → channels)      │
       │               │ contact_id  (FK → contacts)      │
       │               │ platform                         │
       │               │ last_message_at                  │
       │               │ is_ai_enabled (default: true)    │
       │               │ created_at                       │
       │               └──────────────┬───────────────────┘
       │                              │
       │                              ▼
       │               ┌──────────────────────────────────┐
       │               │           messages               │
       │               │──────────────────────────────────│
       │               │ id (PK, UUID)                    │
       │               │ conversation_id (FK)             │
       │               │ sender_type (contact/business/ai)│
       │               │ content (TEXT)                   │
       │               │ platform_message_id              │
       │               │ created_at                       │
       │               └──────────────────────────────────┘
       │
       │               ┌──────────────────────────────────┐
       │               │           products               │
       │               │──────────────────────────────────│
       └───────────────│ business_id (FK → users)         │
                       │ name                             │
                       │ description                      │
                       │ price (Numeric 12,2)             │
                       │ status (available/out_of_stock)  │
                       │ extra_info (JSONB)               │
                       │ created_at / updated_at          │
                       └──────────────────────────────────┘

              ┌──────────────────────────────────────────┐
              │   Milvus: product_embeddings (External)  │
              │──────────────────────────────────────────│
              │ id (VARCHAR PK) ← products.id            │
              │ business_id (VARCHAR)                    │
              │ embedding (FLOAT_VECTOR dim=384, COSINE) │
              └──────────────────────────────────────────┘
```

### Chi tiết từng bảng

#### `users` — Doanh nghiệp & Admin
| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID (PK) | Primary key, auto-gen |
| `email` | VARCHAR(255), UNIQUE, INDEX | Email đăng nhập |
| `password_hash` | VARCHAR(255) | Mật khẩu mã hóa bcrypt |
| `role` | ENUM(`business`, `admin`) | Phân quyền |
| `business_name` | VARCHAR(255), nullable | Tên doanh nghiệp |
| `business_description` | TEXT, nullable | Mô tả doanh nghiệp (dùng làm context cho AI) |
| `phone` | VARCHAR(20), nullable | Số điện thoại |
| `created_at` | TIMESTAMP | Ngày tạo |
| `updated_at` | TIMESTAMP | Ngày cập nhật |

#### `channels` — Kênh kết nối (Facebook Page / Instagram)
| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID (PK) | |
| `business_id` | UUID (FK → users) | Doanh nghiệp sở hữu |
| `platform` | ENUM(`facebook`, `instagram`) | Nền tảng |
| `platform_page_id` | VARCHAR(255) | Facebook Page ID hoặc IG account ID |
| `page_name` | VARCHAR(255), nullable | Tên trang |
| `access_token` | TEXT | Page Access Token (dùng để gọi API gửi tin nhắn) |
| `is_active` | BOOLEAN, default true | Trạng thái hoạt động |
| `created_at` | TIMESTAMP | |

#### `contacts` — Khách hàng cuối (tự động tạo từ webhook)
| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID (PK) | |
| `business_id` | UUID (FK → users) | Thuộc doanh nghiệp nào |
| `platform` | ENUM(`facebook`, `instagram`) | Đến từ nền tảng nào |
| `platform_user_id` | VARCHAR(255) | Facebook/Instagram user ID gốc |
| `display_name` | VARCHAR(255), nullable | Tên hiển thị |
| `profile_pic_url` | TEXT, nullable | URL ảnh đại diện |
| `created_at` | TIMESTAMP | |

#### `conversations` — Cuộc hội thoại
| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID (PK) | |
| `business_id` | UUID (FK → users) | |
| `channel_id` | UUID (FK → channels) | Qua kênh nào |
| `contact_id` | UUID (FK → contacts) | Với khách hàng nào |
| `platform` | ENUM(`facebook`, `instagram`) | |
| `last_message_at` | TIMESTAMP, nullable | Tin nhắn cuối cùng (dùng để sắp xếp) |
| `is_ai_enabled` | BOOLEAN, default true | Bật/tắt AI tự động trả lời cho conversation này |
| `created_at` | TIMESTAMP | |

#### `messages` — Tin nhắn
| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID (PK) | |
| `conversation_id` | UUID (FK → conversations) | Thuộc cuộc hội thoại nào |
| `sender_type` | ENUM(`contact`, `business`, `ai`) | Người gửi: khách / doanh nghiệp / AI |
| `content` | TEXT | Nội dung tin nhắn |
| `platform_message_id` | VARCHAR(255), nullable | ID tin nhắn gốc trên FB/IG |
| `created_at` | TIMESTAMP | |

#### `products` — Sản phẩm (Knowledge Base cho AI)
| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID (PK) | |
| `business_id` | UUID (FK → users) | |
| `name` | VARCHAR(255) | Tên sản phẩm |
| `description` | TEXT, nullable | Mô tả chi tiết |
| `price` | NUMERIC(12,2), nullable | Giá |
| `status` | ENUM(`available`, `out_of_stock`) | Còn hàng / Hết hàng |
| `extra_info` | JSONB, nullable | Thông tin mở rộng (JSON tùy ý) |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

#### Milvus Cloud: `product_embeddings` (External Vector DB)
| Field | Type | Mô tả |
|---|---|---|
| `id` | VARCHAR (PK) | = products.id (string UUID) |
| `business_id` | VARCHAR | Dùng để filter khi search |
| `embedding` | FLOAT_VECTOR(384) | Vector embedding, COSINE similarity |

---

## 3. Các Flow Chính

### Flow 1: Đăng ký & Đăng nhập

```
Doanh nghiệp                    Frontend                          Backend
─────────────                    ────────                          ───────
     │                              │                                 │
     │── Nhập email, pass, tên ────►│                                 │
     │                              │── POST /api/auth/register ─────►│
     │                              │                                 │── Tạo user (role=business)
     │                              │                                 │── Hash password (bcrypt)
     │                              │◄── { access_token } ───────────│
     │                              │                                 │
     │                              │── GET /api/auth/me ────────────►│
     │                              │◄── { user object } ────────────│
     │◄── Redirect → /chat ────────│                                 │
```

### Flow 2: Kết nối Facebook Page (OAuth)

```
Doanh nghiệp     Frontend           Backend                   Facebook
─────────────     ────────           ───────                   ────────
     │               │                  │                         │
     │── Click ─────►│                  │                         │
     │  "Kết nối FB" │                  │                         │
     │               │── GET /api/channels/facebook/oauth ───────►│
     │               │◄── redirect URL ─│                         │
     │               │                  │                         │
     │◄── Redirect to Facebook Login ──────────────────────────►│
     │                                                            │
     │── Đăng nhập FB, chọn Page, cấp quyền ──────────────────►│
     │                                                            │
     │◄── Redirect về /api/channels/facebook/callback?code=XXX ─│
     │               │                  │                         │
     │               │                  │── Exchange code → token─►│
     │               │                  │◄── User Access Token ──│
     │               │                  │── Get Pages list ──────►│
     │               │                  │◄── [{id, name, token}] │
     │               │                  │── Subscribe webhooks ──►│
     │               │                  │── Check IG accounts ───►│
     │               │                  │                         │
     │               │                  │── Lưu Channel(s) vào DB │
     │               │                  │   (Facebook + Instagram) │
     │               │◄── Redirect /channels?success=true ──────│
     │◄── Thấy channels đã kết nối ─│                            │
```

### Flow 3: Nhận tin nhắn & AI tự động trả lời (Core Flow)

Đây là flow quan trọng nhất của hệ thống:

```
Khách hàng       Facebook          Backend                    Milvus    Groq LLM
──────────       ────────          ───────                    ──────    ────────
    │               │                 │                          │         │
    │── Nhắn tin ──►│                 │                          │         │
    │  vào Fanpage  │                 │                          │         │
    │               │── POST /api/webhooks/facebook ────────────►│         │
    │               │                 │                          │         │
    │               │                 │  1. Tìm Channel theo page_id      │
    │               │                 │  2. Tìm/tạo Contact (auto)        │
    │               │                 │  3. Tìm/tạo Conversation (auto)   │
    │               │                 │  4. Lưu Message (sender=contact)  │
    │               │                 │                          │         │
    │               │                 │──► WebSocket push ──────────────────► Frontend
    │               │                 │    (DN thấy tin nhắn real-time)    │  (real-time)
    │               │                 │                          │         │
    │               │                 │   [Nếu is_ai_enabled = true]      │
    │               │                 │                          │         │
    │               │                 │  5. Encode câu hỏi ─────►│        │
    │               │                 │     → query vector 384d  │         │
    │               │                 │                          │         │
    │               │                 │  6. Search top-5 products│         │
    │               │                 │     (COSINE, filter      │         │
    │               │                 │      by business_id)     │         │
    │               │                 │◄── [{product data}] ────│         │
    │               │                 │                          │         │
    │               │                 │  7. Build LLM prompt:    │         │
    │               │                 │     System: "Bạn là trợ lý bán    │
    │               │                 │     hàng của {business_name}..."   │
    │               │                 │     Context: Top-5 products        │
    │               │                 │     History: 10 tin nhắn gần nhất  │
    │               │                 │     User: "{câu hỏi khách}"       │
    │               │                 │                          │         │
    │               │                 │  8. Call Groq LLM ──────────────►│
    │               │                 │◄── AI response (tiếng Việt) ────│
    │               │                 │                          │         │
    │               │                 │  9. Lưu Message (sender=ai)       │
    │               │                 │                          │         │
    │               │◄── 10. Gửi reply qua FB API ─────────────│          │
    │◄── Nhận tin ──│                 │                          │         │
    │   trả lời AI  │                 │──► WebSocket push AI reply ──────► Frontend
```

### Flow 4: Doanh nghiệp chat thủ công

```
Doanh nghiệp     Frontend                 Backend              Facebook/IG
─────────────     ────────                 ───────              ───────────
     │               │                        │                      │
     │── Gõ tin ────►│                        │                      │
     │   nhắn        │                        │                      │
     │               │── POST /api/conversations/{id}/messages ────►│
     │               │                        │                      │
     │               │                        │── Tìm conversation   │
     │               │                        │── Tìm channel (access_token)
     │               │                        │── Lưu Message (sender=business)
     │               │                        │── Gửi qua FB/IG API ────────►│
     │               │◄── { message } ────────│                      │
     │◄── Hiển thị ──│                        │                      │
```

### Flow 5: Quản lý sản phẩm + Auto Embedding

```
Doanh nghiệp     Frontend              Backend              Milvus
─────────────     ────────              ───────              ──────
     │               │                     │                    │
     │── Thêm/sửa ─►│                     │                    │
     │   sản phẩm    │                     │                    │
     │               │── POST/PUT /api/products ──────────────►│
     │               │                     │                    │
     │               │                     │── Lưu product vào PostgreSQL
     │               │                     │                    │
     │               │                     │── Tạo text:        │
     │               │                     │   "{tên} - {mô tả} │
     │               │                     │    - Giá: {giá}    │
     │               │                     │    - Còn hàng"     │
     │               │                     │                    │
     │               │                     │── all-MiniLM-L6-v2 │
     │               │                     │   encode → vector  │
     │               │                     │   (384 dims)       │
     │               │                     │                    │
     │               │                     │── Upsert embedding ────────►│
     │               │                     │   (id, business_id, vector) │
     │               │◄── { product } ────│                    │
     │◄── Cập nhật ──│                     │                    │
     │   bảng SP     │                     │                    │
```

### Flow 6: Admin Dashboard

```
Admin            Frontend                 Backend
─────            ────────                 ───────
  │                 │                        │
  │── Đăng nhập ──►│                        │
  │  (role=admin)   │── POST /api/auth/login ──────►│
  │                 │◄── token ──────────────│
  │                 │── Redirect → /admin    │
  │                 │                        │
  │                 │── GET /api/admin/statistics ──►│
  │                 │◄── {businesses: 5,             │
  │                 │     channels: 12,              │
  │                 │     conversations: 150,        │
  │                 │     messages: 3200,            │
  │                 │     products: 89}              │
  │                 │                        │
  │                 │── GET /api/admin/businesses ──►│
  │                 │◄── [{business, channel_count,  │
  │                 │     conversation_count,         │
  │                 │     product_count}...]          │
  │◄── Xem tổng quan hệ thống ──│           │
```

---

## 4. API Endpoints

### Auth (`/api/auth`)
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | `/api/auth/register` | — | Đăng ký tài khoản doanh nghiệp |
| POST | `/api/auth/login` | — | Đăng nhập, trả về JWT token |
| GET | `/api/auth/me` | JWT | Lấy thông tin user hiện tại |

### Users (`/api/users`)
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/users/profile` | JWT | Xem profile doanh nghiệp |
| PUT | `/api/users/profile` | JWT | Cập nhật thông tin DN |

### Channels (`/api/channels`)
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/channels` | Business | Danh sách kênh đã kết nối |
| GET | `/api/channels/facebook/oauth` | Business | Bắt đầu Facebook OAuth flow |
| GET | `/api/channels/facebook/callback` | — | Facebook OAuth callback (redirect) |
| POST | `/api/channels/facebook` | Business | Kết nối FB page thủ công (nhập token) |
| POST | `/api/channels/instagram` | Business | Kết nối IG account thủ công |
| DELETE | `/api/channels/{id}` | Business | Ngắt kết nối kênh |

### Conversations & Messages
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/conversations` | Business | Danh sách cuộc hội thoại (kèm contact info) |
| GET | `/api/conversations/{id}` | Business | Chi tiết cuộc hội thoại |
| PATCH | `/api/conversations/{id}/ai` | Business | Bật/tắt AI tự động cho conversation |
| GET | `/api/conversations/{id}/messages` | Business | Lấy tin nhắn (phân trang: skip, limit) |
| POST | `/api/conversations/{id}/messages` | Business | Gửi tin nhắn thủ công → FB/IG |

### Contacts (`/api/contacts`)
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/contacts` | Business | Danh sách khách hàng |
| GET | `/api/contacts/{id}` | Business | Chi tiết khách hàng |

### Products (`/api/products`)
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/products` | Business | Danh sách sản phẩm |
| POST | `/api/products` | Business | Thêm sản phẩm (auto-embedding vào Milvus) |
| PUT | `/api/products/{id}` | Business | Sửa sản phẩm (re-embed) |
| DELETE | `/api/products/{id}` | Business | Xóa sản phẩm (xóa cả embedding) |

### Webhooks (`/api/webhooks`)
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/webhooks/facebook` | Verify Token | Facebook webhook verification (PlainText) |
| POST | `/api/webhooks/facebook` | — | Nhận tin nhắn từ Facebook Messenger |
| GET | `/api/webhooks/instagram` | Verify Token | Instagram webhook verification |
| POST | `/api/webhooks/instagram` | — | Nhận tin nhắn từ Instagram |

### Admin (`/api/admin`)
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/admin/businesses` | Admin | DS tất cả doanh nghiệp + thống kê |
| GET | `/api/admin/statistics` | Admin | Thống kê toàn hệ thống |

### WebSocket
| Path | Mô tả |
|------|-------|
| `ws://{host}/ws/{business_id}` | Nhận tin nhắn mới real-time cho doanh nghiệp |

### Utility (main.py)
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/` | Health check |
| GET | `/privacy` | Privacy Policy (yêu cầu của Facebook) |
| GET | `/data-deletion` | Hướng dẫn xóa dữ liệu |
| POST | `/api/data-deletion/callback` | Facebook data deletion callback |
| GET | `/test/facebook` | Trang test Facebook integration |

**Tổng: 28 HTTP endpoints + 1 WebSocket endpoint**

---

## 5. RAG Pipeline (Retrieval-Augmented Generation)

```
                    ┌─────────────────────────────────────────┐
                    │         Khi tạo/sửa Product              │
                    │                                          │
                    │  Text = "{name} - {description}           │
                    │          - Giá: {price}                   │
                    │          - Còn hàng/Hết hàng"            │
                    │              │                            │
                    │              ▼                            │
                    │    all-MiniLM-L6-v2                       │
                    │    encode → vector (384 dims)             │
                    │              │                            │
                    │              ▼                            │
                    │    Upsert vào Milvus Cloud                │
                    │    (COSINE similarity, AUTOINDEX)         │
                    └─────────────────────────────────────────┘

                    ┌─────────────────────────────────────────┐
                    │     Khi khách hỏi về sản phẩm           │
                    │                                          │
                    │  1. Encode câu hỏi → query vector        │
                    │                                          │
                    │  2. Milvus search: top-5 products         │
                    │     WHERE business_id = current_business  │
                    │     ORDER BY COSINE_SIMILARITY DESC       │
                    │                                          │
                    │  3. Build LLM prompt:                     │
                    │     ┌─────────────────────────────────┐  │
                    │     │ System: "Bạn là trợ lý bán hàng │  │
                    │     │ của {business_name}.             │  │
                    │     │ {business_description}           │  │
                    │     │ Dữ liệu sản phẩm liên quan:     │  │
                    │     │ [top-5 products]"                │  │
                    │     ├─────────────────────────────────┤  │
                    │     │ Chat history (10 tin gần nhất)   │  │
                    │     ├─────────────────────────────────┤  │
                    │     │ User: "{câu hỏi của khách}"     │  │
                    │     └─────────────────────────────────┘  │
                    │                                          │
                    │  4. Groq API (llama-3.3-70b-versatile)   │
                    │     → AI response (tiếng Việt)           │
                    │                                          │
                    │  5. Gửi response qua Facebook/IG API     │
                    │  6. Push qua WebSocket cho frontend       │
                    └─────────────────────────────────────────┘
```

---

## 6. Cấu Trúc Thư Mục

```
Omni_channel_chatbot/
├── README.md                      # Tài liệu dự án (file này)
├── requirement.txt                # Đặc tả yêu cầu nghiệp vụ
├── plan.md                        # Kế hoạch kỹ thuật chi tiết
│
├── backend/                       # ===== FastAPI Backend =====
│   ├── main.py                    # Entry point: routes, WebSocket, lifespan events
│   ├── requirements.txt           # Python dependencies (local dev)
│   ├── requirements.railway.txt   # Python dependencies (Railway - CPU PyTorch)
│   ├── Dockerfile                 # Multi-stage Docker build cho Railway
│   ├── start.sh                   # Auto-migration + server start
│   ├── railway.toml               # Railway deployment config
│   ├── Procfile                   # Process file
│   ├── alembic.ini                # Alembic config
│   ├── alembic/
│   │   ├── env.py                 # Async migration env (đọc DATABASE_URL)
│   │   └── versions/
│   │       └── 7295b3d8957d_*.py  # Initial migration (tạo 6 bảng)
│   └── app/
│       ├── config.py              # Pydantic Settings (tất cả env vars)
│       ├── database.py            # SQLAlchemy async engine + session factory
│       ├── models/                # 6 SQLAlchemy ORM models
│       │   ├── user.py            # User (Business + Admin)
│       │   ├── channel.py         # Facebook/Instagram channels
│       │   ├── contact.py         # End customers (từ webhook)
│       │   ├── conversation.py    # Cuộc hội thoại
│       │   ├── message.py         # Tin nhắn
│       │   └── product.py         # Sản phẩm (knowledge base)
│       ├── schemas/               # Pydantic request/response schemas
│       │   ├── auth.py            # LoginRequest, RegisterRequest, TokenResponse
│       │   ├── user.py            # UserOut, UserUpdate
│       │   ├── channel.py         # ChannelCreate, ChannelOut
│       │   ├── contact.py         # ContactOut
│       │   ├── conversation.py    # ConversationOut, ConversationAIToggle
│       │   ├── message.py         # MessageCreate, MessageOut
│       │   └── product.py         # ProductCreate, ProductUpdate, ProductOut
│       ├── api/                   # Route handlers
│       │   ├── deps.py            # Auth dependencies (JWT decode, role check)
│       │   ├── auth.py            # Register, Login, Me
│       │   ├── users.py           # Profile CRUD
│       │   ├── channels.py        # FB/IG OAuth + channel management
│       │   ├── contacts.py        # Contact listing
│       │   ├── conversations.py   # Conversation list + AI toggle
│       │   ├── messages.py        # Get/send messages → FB/IG API
│       │   ├── products.py        # Product CRUD + auto-embedding
│       │   ├── webhooks.py        # FB/IG webhook receiver + AI pipeline
│       │   └── admin.py           # Admin dashboard (stats, business list)
│       ├── services/              # Business logic layer
│       │   ├── ai_service.py      # RAG: Milvus search → Groq LLM
│       │   ├── embedding_service.py  # sentence-transformers encoding
│       │   ├── facebook_service.py   # FB Messenger Graph API
│       │   ├── instagram_service.py  # IG Messaging Graph API
│       │   ├── milvus_service.py     # Milvus Cloud vector DB client
│       │   └── oauth_service.py      # Facebook OAuth flow helpers
│       └── websocket/
│           └── manager.py         # WebSocket connection manager (per business)
│
└── frontend/                      # ===== React Frontend =====
    ├── package.json               # Dependencies: React, Ant Design, Zustand
    ├── vite.config.js             # Proxy /api → backend, /ws → WebSocket
    ├── index.html                 # HTML shell
    └── src/
        ├── main.jsx               # Entry: React + Ant Design vi_VN locale
        ├── App.jsx                # Routes + PrivateRoute + AdminRoute guards
        ├── api/
        │   └── client.js          # Axios instance + JWT interceptor + 401 handler
        ├── store/                 # Zustand state management
        │   ├── authStore.js       # Token + user (persisted localStorage)
        │   ├── chatStore.js       # Conversations + messages + WebSocket events
        │   └── channelStore.js    # Connected channels
        ├── pages/
        │   ├── Login.jsx          # Email/password → JWT → role-based redirect
        │   ├── Register.jsx       # Business registration (4 fields)
        │   ├── Chat.jsx           # Main inbox: conversation list + message thread
        │   ├── Channels.jsx       # OAuth connect + manual token + disconnect
        │   ├── Products.jsx       # CRUD table + modal (name, desc, price, status)
        │   ├── Settings.jsx       # Edit business_name, description, phone
        │   └── AdminDashboard.jsx # Stats cards + business table (admin only)
        ├── components/
        │   └── Layout.jsx         # Ant Design Sider/Header + WebSocket + logout
        └── utils/
            └── websocket.js       # WebSocket singleton + auto-reconnect
```

---

## 7. Trạng Thái Dự Án

### ✅ Đã hoàn thành

| # | Chức năng | Backend | Frontend | Ghi chú |
|---|-----------|---------|----------|---------|
| 1 | Đăng ký doanh nghiệp | ✅ | ✅ | role=business, bcrypt hash |
| 2 | Đăng nhập (Business + Admin) | ✅ | ✅ | JWT, role-based redirect |
| 3 | Quản lý profile DN | ✅ | ✅ | name, description, phone |
| 4 | Kết nối Facebook Page | ✅ | ✅ | OAuth flow + manual token |
| 5 | Kết nối Instagram | ✅ | ✅ | Auto-detect từ FB + manual |
| 6 | Ngắt kết nối kênh | ✅ | ✅ | |
| 7 | Webhook nhận tin nhắn FB | ✅ | — | Auto-create contact & conversation |
| 8 | Webhook nhận tin nhắn IG | ✅ | — | |
| 9 | Xem danh sách cuộc hội thoại | ✅ | ✅ | Kèm contact info, sort by last_message |
| 10 | Xem tin nhắn (phân trang) | ✅ | ✅ | skip/limit pagination |
| 11 | Gửi tin nhắn thủ công | ✅ | ✅ | → FB/IG API |
| 12 | AI tự động trả lời | ✅ | — | RAG: Milvus → Groq LLM |
| 13 | Bật/tắt AI per conversation | ✅ | ✅ | Toggle switch |
| 14 | CRUD sản phẩm | ✅ | ✅ | Auto-embed vào Milvus |
| 15 | WebSocket real-time | ✅ | ✅ | Push tin nhắn mới |
| 16 | Admin dashboard | ✅ | ✅ | Thống kê + ds doanh nghiệp |
| 17 | Xem danh sách contacts | ✅ | — | API có, frontend chưa trang riêng |
| 18 | Deploy backend (Railway) | ✅ | — | Docker + auto-migration + PostgreSQL |
| 19 | Privacy Policy + Data Deletion | ✅ | — | Yêu cầu Facebook App Review |
| 20 | Webhook verification | ✅ | — | PlainTextResponse |

### ⚠️ Known Issues (chấp nhận cho PoC)

| # | Vấn đề | Ảnh hưởng |
|---|--------|-----------|
| 1 | OAuth state lưu in-memory | Mất khi restart, ok cho demo |
| 2 | WebSocket không xác thực JWT | Cần biết UUID, ok cho demo |
| 3 | Không verify webhook signature (X-Hub-Signature-256) | Có thể bị giả mạo |
| 4 | Embedding model tối ưu tiếng Anh | Hoạt động được với tiếng Việt đơn giản |
| 5 | Duplicate WebSocket trong Chat.jsx + Layout.jsx | Nên xóa ở Chat.jsx |
| 6 | Frontend `.env` WS URL vẫn localhost | Cần update khi deploy |

### ❌ Ngoài scope PoC (chưa triển khai)

- Đổi mật khẩu / quên mật khẩu / xác thực email
- Xóa tài khoản
- Tin nhắn ảnh / file / rich media
- Tìm kiếm / lọc conversation
- Phân trang cho contacts, channels, conversations
- Import/export sản phẩm hàng loạt
- Admin disable/delete doanh nghiệp
- Rate limiting
- Webhook payload signature verification

---

## 8. Tác Nhân Hệ Thống

| Tác nhân | Vai trò | Hoạt động chính |
|----------|---------|------------------|
| **Doanh nghiệp (Business)** | Người dùng chính | Đăng ký → Kết nối FB/IG → Nhập sản phẩm → Xem/trả lời tin nhắn |
| **Contact (Khách hàng cuối)** | Khách hàng của DN | Nhắn tin qua FB/IG → Nhận phản hồi từ AI hoặc DN |
| **Admin** | Quản trị viên ViaConnect | Đăng nhập → Xem thống kê hệ thống → Hỗ trợ DN |

---

## 9. Environment Variables

### Backend (`.env`)
```env
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host:port/dbname

# Auth
SECRET_KEY=your-jwt-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# AI / LLM
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
EMBEDDING_MODEL=all-MiniLM-L6-v2

# Vector Database (Milvus Cloud / Zilliz)
MILVUS_URI=https://...api.cloud.zilliz.com
MILVUS_TOKEN=...

# Facebook App
FB_APP_ID=...
FB_APP_SECRET=...
FB_VERIFY_TOKEN=chatdesk_verify_token
FB_OAUTH_REDIRECT_URI=https://your-backend/api/channels/facebook/callback

# Application
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Frontend (`.env`)
```env
VITE_API_URL=https://your-backend-url
VITE_WS_URL=wss://your-backend-url
```

---

## 10. Cài Đặt & Chạy Local

```bash
# 1. Backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
cp .env.example .env            # Sửa biến môi trường
alembic upgrade head            # Tạo bảng
uvicorn main:app --reload       # http://localhost:8000

# 2. Frontend
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

### Deploy Railway
Xem chi tiết tại [DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md).

---

## 11. Deployment

| Service | URL |
|---------|-----|
| Backend API | `https://omnichannelchatbotserver-production.up.railway.app` |
| API Docs (Swagger) | `https://omnichannelchatbotserver-production.up.railway.app/docs` |
| Health Check | `https://omnichannelchatbotserver-production.up.railway.app/` |
| FB Test Page | `https://omnichannelchatbotserver-production.up.railway.app/test/facebook` |
| Frontend | Chưa deploy (localhost:5173) |
