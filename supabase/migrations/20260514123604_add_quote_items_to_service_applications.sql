ALTER TABLE service_applications
ADD COLUMN IF NOT EXISTS quote_items JSONB DEFAULT '[]';
