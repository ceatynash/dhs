-- Multi-tenant foundation for the DHS e-Report portal.
-- This migration is intentionally schema-only. Do not deploy it as a complete
-- multi-tenant release until server.js scopes every read/write and socket event.
-- Run against a backup/staging database first.

BEGIN;

CREATE TABLE IF NOT EXISTS schools (
    tenant_id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    logo_url TEXT,
    primary_color TEXT NOT NULL DEFAULT '#1d4ed8',
    secondary_color TEXT NOT NULL DEFAULT '#0f172a',
    custom_domain TEXT UNIQUE,
    subscription_status TEXT NOT NULL DEFAULT 'active'
        CHECK (subscription_status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schools (tenant_id, slug, display_name)
VALUES ('daramombe-high-school', 'dhs', 'Daramombe High School')
ON CONFLICT (tenant_id) DO NOTHING;

-- IMPORTANT: students.school_id is the student's DHS ID in the current app.
-- Never repurpose it as the tenant identifier. tenant_id is a separate column.
ALTER TABLE students ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE dosa_members ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Existing production data remains attached to the original DHS tenant.
UPDATE students SET tenant_id = 'daramombe-high-school' WHERE tenant_id IS NULL;
UPDATE staff SET tenant_id = 'daramombe-high-school' WHERE tenant_id IS NULL;
UPDATE dosa_members SET tenant_id = 'daramombe-high-school' WHERE tenant_id IS NULL;

ALTER TABLE students ALTER COLUMN tenant_id SET DEFAULT 'daramombe-high-school';
ALTER TABLE staff ALTER COLUMN tenant_id SET DEFAULT 'daramombe-high-school';
ALTER TABLE dosa_members ALTER COLUMN tenant_id SET DEFAULT 'daramombe-high-school';

ALTER TABLE students ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE staff ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE dosa_members ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_tenant_id_fkey') THEN
        ALTER TABLE students ADD CONSTRAINT students_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES schools(tenant_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_tenant_id_fkey') THEN
        ALTER TABLE staff ADD CONSTRAINT staff_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES schools(tenant_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dosa_members_tenant_id_fkey') THEN
        ALTER TABLE dosa_members ADD CONSTRAINT dosa_members_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES schools(tenant_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS students_tenant_sort_idx ON students (tenant_id, sort_order, id);
CREATE INDEX IF NOT EXISTS staff_tenant_sort_idx ON staff (tenant_id, sort_order, id);
CREATE INDEX IF NOT EXISTS dosa_members_tenant_sort_idx ON dosa_members (tenant_id, sort_order, id);

COMMIT;
