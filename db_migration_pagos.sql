-- Migracion para agregar campos de pago a la tabla pedidos
-- Ejecutar UNA SOLA VEZ en PostgreSQL

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS link_pago TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS netpay_session_id TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pagado BOOLEAN DEFAULT FALSE;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_pago TIMESTAMPTZ;
