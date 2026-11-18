-- Migration: migrations/005_invoice_numbering.sql
-- Description: Dynamic invoice numbering — sequence, period reset, and bill audit columns
-- Pattern text continues to live in banks.starting_invoice_no

BEGIN;

-- 1. Bank sequence / reset state
ALTER TABLE public.banks
    ADD COLUMN IF NOT EXISTS invoice_seed INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS invoice_last_seq INT,
    ADD COLUMN IF NOT EXISTS invoice_period_key TEXT,
    ADD COLUMN IF NOT EXISTS invoice_reset_mode TEXT NOT NULL DEFAULT 'monthly',
    ADD COLUMN IF NOT EXISTS invoice_seq_width INT;

-- Normalize any unexpected reset-mode values before adding the check constraint
UPDATE public.banks
SET invoice_reset_mode = 'monthly'
WHERE invoice_reset_mode IS NULL
   OR invoice_reset_mode NOT IN ('monthly', 'yearly', 'financial_year', 'continuous');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'banks_invoice_reset_mode_check'
          AND conrelid = 'public.banks'::regclass
    ) THEN
        ALTER TABLE public.banks
            ADD CONSTRAINT banks_invoice_reset_mode_check
            CHECK (invoice_reset_mode IN ('monthly', 'yearly', 'financial_year', 'continuous'));
    END IF;
END $$;

-- 2. Persist resolved invoice numbers on generated bills
ALTER TABLE public.bills
    ADD COLUMN IF NOT EXISTS invoice_number TEXT,
    ADD COLUMN IF NOT EXISTS invoice_seq INT,
    ADD COLUMN IF NOT EXISTS invoice_period_key TEXT;

CREATE INDEX IF NOT EXISTS idx_bills_invoice_number ON public.bills (invoice_number);
CREATE INDEX IF NOT EXISTS idx_banks_invoice_period ON public.banks (invoice_period_key);

COMMIT;
