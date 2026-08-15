-- 🔧 FULL TICKETS TABLE UPGRADE — Run once
DO $$
BEGIN
  -- ticket_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'ticket_id') THEN
    ALTER TABLE tickets ADD COLUMN ticket_id VARCHAR(20);
    UPDATE tickets SET ticket_id = 'TCK-' || LPAD(id::TEXT, 6, '0') WHERE ticket_id IS NULL OR ticket_id = '';
    ALTER TABLE tickets ALTER COLUMN ticket_id SET NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_ticket_id_key') THEN
      ALTER TABLE tickets ADD CONSTRAINT tickets_ticket_id_key UNIQUE (ticket_id);
    END IF;
  END IF;

  -- category
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'category') THEN
    ALTER TABLE tickets ADD COLUMN category VARCHAR(50) DEFAULT 'general';
  END IF;

  -- priority
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'priority') THEN
    ALTER TABLE tickets ADD COLUMN priority VARCHAR(20) DEFAULT 'normal';
  END IF;

  -- status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'status') THEN
    ALTER TABLE tickets ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'NEW';
  ELSE
    ALTER TABLE tickets ALTER COLUMN status SET NOT NULL;
    ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'NEW';
  END IF;

  -- source
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'source') THEN
    ALTER TABLE tickets ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'portal';
  END IF;

  -- created_by_id & created_by_type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'created_by_id') THEN
    ALTER TABLE tickets ADD COLUMN created_by_id INTEGER;
    UPDATE tickets SET created_by_id = 1 WHERE created_by_id IS NULL;
    ALTER TABLE tickets ALTER COLUMN created_by_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'created_by_type') THEN
    ALTER TABLE tickets ADD COLUMN created_by_type VARCHAR(20) DEFAULT 'customer';
    ALTER TABLE tickets ALTER COLUMN created_by_type SET NOT NULL;
    ALTER TABLE tickets ADD CONSTRAINT chk_created_by_type CHECK (created_by_type IN ('customer', 'staff'));
  END IF;

  -- timestamps
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'updated_at') THEN
    ALTER TABLE tickets ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'closed_at') THEN
    ALTER TABLE tickets ADD COLUMN closed_at TIMESTAMP;
  END IF;

  -- project_id (your key question!)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'project_id') THEN
    ALTER TABLE tickets ADD COLUMN project_id INTEGER;
    -- Optional: try to infer from customer (if customers table has project_id)
    UPDATE tickets t
    SET project_id = c.project_id
    FROM customers c
    WHERE t.customer_id = c.id AND t.project_id IS NULL;
    ALTER TABLE tickets ALTER COLUMN project_id SET NOT NULL;
    ALTER TABLE tickets ADD CONSTRAINT tickets_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
  END IF;

  -- customer_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'customer_id') THEN
    ALTER TABLE tickets ADD COLUMN customer_id INTEGER;
    ALTER TABLE tickets ALTER COLUMN customer_id SET NOT NULL;
    ALTER TABLE tickets ADD CONSTRAINT tickets_customer_id_fkey 
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
  END IF;

  -- title & description
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'title') THEN
    ALTER TABLE tickets ADD COLUMN title VARCHAR(255);
    UPDATE tickets SET title = 'Untitled' WHERE title IS NULL;
    ALTER TABLE tickets ALTER COLUMN title SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'description') THEN
    ALTER TABLE tickets ADD COLUMN description TEXT;
    UPDATE tickets SET description = 'No description' WHERE description IS NULL;
    ALTER TABLE tickets ALTER COLUMN description SET NOT NULL;
  END IF;

  -- updated_at trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tickets_updated_at') THEN
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER update_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  RAISE NOTICE '✅ tickets table upgraded successfully';
END $$;

-- Check current structure
\d customers

-- Then run these commands to fix it
ALTER TABLE customers RENAME COLUMN IF EXISTS name TO customer_name;
ALTER TABLE customers RENAME COLUMN IF EXISTS email TO contact_email;
ALTER TABLE customers RENAME COLUMN IF EXISTS phone TO contact_phone;

-- Make sure required columns exist and are correct
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255) NOT NULL DEFAULT 'Unknown Customer';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT;

-- Add unique constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_email_per_project') THEN
    ALTER TABLE customers ADD CONSTRAINT unique_email_per_project UNIQUE (project_id, contact_email);
  END IF;
END $$;

-- Re-add indexes
CREATE INDEX IF NOT EXISTS idx_customers_project_id ON customers(project_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(contact_email);





ALTER TABLE users 
DROP CONSTRAINT users_role_check;

ALTER TABLE users 
ADD CONSTRAINT users_role_check 
CHECK (role IN (
  'requester', 'approver', 'issuer', 'superadmin',
  'field_engineer', 'field_engineer_admin', 'finance',
  'director', 'cx', 'noc', 'customer'
));


-- Step 1: Remove the old restrictive constraint
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_source_check;

-- Step 2: Add a new, correct constraint that allows proper sources
ALTER TABLE tickets 
ADD CONSTRAINT tickets_source_check 
CHECK (source IN ('customer', 'staff', 'portal', 'email', 'api', 'phone'));

ALTER TABLE tickets 
ALTER COLUMN source SET DEFAULT 'customer';


-- Add column if missing
ALTER TABLE ticket_timeline 
ADD COLUMN IF NOT EXISTS resolution_summary TEXT;

-- Optional: force resolution comment for RESOLVED/CLOSED
-- You can do it in the function or with trigger


-- Option B: If you want to be more flexible in the future (recommended for evolving systems)
ALTER TABLE tickets
DROP CONSTRAINT tickets_status_check;

ALTER TABLE tickets
ADD CONSTRAINT tickets_status_check
CHECK (status IN ('NEW', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPEN')
       AND status = UPPER(status));  -- optional: enforce uppercase


       run

       ALTER TABLE tickets
ADD COLUMN attachments JSONB;   -- PostgreSQL
-- or
ADD COLUMN attachments TEXT;    -- MySQL / SQLite (store JSON string)
Add COLUMNIF NOT EXISTS attachments JSONB;