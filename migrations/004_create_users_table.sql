-- Migration: migrations/004_create_users_table.sql
-- Description: Creates public.users table for self-hosted JWT authentication
-- Replaces Supabase Auth (auth.users)
-- Default admin: admin@babuadvocate.com / Admin@12345

BEGIN;

-- 1. Enable uuid generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create the users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Index for fast email lookup (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON public.users (LOWER(email));

-- 4. Seed initial admin user (password: Admin@12345)
-- Hash: bcrypt rounds=12
INSERT INTO public.users (email, password_hash, role)
VALUES (
    'admin@babuadvocate.com',
    '$2b$12$jrO3RIb4DyKUIIIrhNQHqetu5duG.QAAFCi1u4XnBhE5aZ5AWJTnS',
    'admin'
)
ON CONFLICT (email) DO NOTHING;

COMMIT;
