DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vobiss') THEN
    CREATE ROLE vobiss LOGIN PASSWORD 'vobiss123';
  END IF;
END
$$;

SELECT 'CREATE DATABASE vobiss OWNER vobiss'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'vobiss')\gexec

GRANT ALL PRIVILEGES ON DATABASE vobiss TO vobiss;
ALTER DATABASE vobiss OWNER TO vobiss;
