-- ============================================
-- ChatDesk - Seed Data: Admin User
-- ============================================
-- Password: admin123 (bcrypt hash)
-- Role: admin
-- ============================================

INSERT INTO users (id, email, password_hash, role, business_name, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'admin@chatdesk.vn',
    '$2b$12$z6jfo/KSsbW9WT9m2MXKuOiWQi7M9uHn.i1cnZ7WrWCYuYrVxgSs6',
    'admin',
    'ChatDesk Admin',
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;
