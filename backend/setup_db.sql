-- ChatDesk Database Setup Script
-- Run this in PostgreSQL after creating the database

-- Create database (run as postgres superuser)
-- CREATE DATABASE chatdesk;

-- Connect to chatdesk database
\c chatdesk

-- No extensions needed — vector embeddings are stored in Milvus.

-- Done! Now run Alembic migrations to create tables:
-- cd backend
-- alembic revision --autogenerate -m "Initial migration"
-- alembic upgrade head
