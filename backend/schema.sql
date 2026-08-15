-- 1. Find the exact name of the current role constraint
SELECT conname 
FROM pg_constraint 
WHERE conrelid = 'users'::regclass AND contype = 'c' AND conname LIKE '%role%';




-- 2. Drop the OLD broken constraint (replace "the_name_you_see" with what step 1 showed)
-- Common names — try them one by one until one works:
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS "users_role_check";
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_role;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check;


-- Remove the broken/old ones
ALTER TABLE users DROP CONSTRAINT check_role;
ALTER TABLE users DROP CONSTRAINT users_role_check;

-- Add the correct one with the new roles
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('requester','approver','issuer','superadmin','field_engineer','field_engineer_admin'));


  TODAY SCHEMA UPDATE TO FIX BROKEN CONSTRAINT


RUN THIS CODE
-- Make these fields optional so cash requests can skip them
ALTER TABLE requests 
  ALTER COLUMN team_leader_name DROP NOT NULL,
  ALTER COLUMN team_leader_phone DROP NOT NULL,
  ALTER COLUMN deployment_type DROP NOT NULL;

-- Optional: Set defaults to NULL
ALTER TABLE requests 
  ALTER COLUMN team_leader_name SET DEFAULT NULL,
  ALTER COLUMN team_leader_phone SET DEFAULT NULL,
  ALTER COLUMN deployment_type SET DEFAULT NULL;


ALTER TABLE requests 
  ALTER COLUMN project_name DROP NOT NULL,
  ALTER COLUMN isp_name DROP NOT NULL,
  ALTER COLUMN location DROP NOT NULL;

-- Optional: set defaults
ALTER TABLE requests 
  ALTER COLUMN project_name SET DEFAULT NULL,
  ALTER COLUMN isp_name SET DEFAULT NULL,
  ALTER COLUMN location SET DEFAULT NULL;

RUN THIS CODE
  ALTER TABLE requests 
DROP CONSTRAINT requests_type_check;

ALTER TABLE requests 
ADD CONSTRAINT requests_type_check 
CHECK (type IN ('material_request', 'item_return', 'cash_request'));

RUN THIS CODE
-- Step 1: Update old 'approved' statuses to the new equivalent
-- Assuming 'approved' meant supervisor approved before
UPDATE requests 
SET status = 'supervisor_approved' 
WHERE status = 'approved';

-- Step 2: (Optional) If you have any weird statuses, fix them
-- Check what statuses exist:
SELECT DISTINCT status FROM requests;

-- Fix any others if needed, e.g.:
-- UPDATE requests SET status = 'pending' WHERE status = 'something_wrong';

-- Step 3: Now drop the old constraint safely
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_status_check;

-- Step 4: Add the new correct constraint
ALTER TABLE requests 
ADD CONSTRAINT requests_status_check 
CHECK (status IN ('pending', 'supervisor_approved', 'finance_approved', 'completed', 'rejected'));

RUN THIS CODE

CREATE TABLE cash_expenses (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
  total DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for performance
CREATE INDEX idx_cash_expenses_request_id ON cash_expenses(request_id);


-- Drop the old table if it exists
DROP TABLE IF EXISTS cash_expenses CASCADE;

-- Recreate it correctly with the generated line_total column
CREATE TABLE cash_expenses (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recreate index
CREATE INDEX IF NOT EXISTS idx_cash_expenses_request_id ON cash_expenses(request_id);


ALTER TABLE cash_expenses 
ADD COLUMN IF NOT EXISTS line_total DECIMAL(12,2) 
GENERATED ALWAYS AS (quantity * unit_price) STORED;


-- Step 1: Remove the old constraint
ALTER TABLE users
DROP CONSTRAINT users_role_check;

-- Step 2: Add the new constraint with 'finance' included
ALTER TABLE users
ADD CONSTRAINT users_role_check
CHECK (
  role IN (
    'requester',
    'approver',
    'issuer',
    'superadmin',
    'field_engineer',
    'field_engineer_admin',
    'finance'  -- ← This is the new one!
  )
);