-- Run this ONCE as the postgres superuser to create the shared dev role
-- psql -U postgres -f setup-db.sql
--
-- The "unicornforged" role is reused across all Unicorn Forge projects.
-- Only the CREATE DATABASE section changes per project.

-- 1. Create the shared admin role (skip if it already exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'unicornforged') THEN
    CREATE USER unicornforged WITH PASSWORD 'unicornforged' CREATEDB CREATEROLE;
    RAISE NOTICE 'Created role: unicornforged';
  ELSE
    RAISE NOTICE 'Role unicornforged already exists — skipping';
  END IF;
END $$;

-- 2. Create this project's database
CREATE DATABASE forge_template OWNER unicornforged;
GRANT ALL PRIVILEGES ON DATABASE forge_template TO unicornforged;
