ALTER TABLE venues
  ADD COLUMN coordinator_name VARCHAR(150) NULL AFTER mohallah_id,
  ADD COLUMN contact_number VARCHAR(20) NULL AFTER coordinator_name,
  ADD COLUMN whatsapp_number VARCHAR(20) NULL AFTER contact_number,
  ADD COLUMN password_hash VARCHAR(255) NULL AFTER whatsapp_number,
  ADD COLUMN last_login_at DATETIME NULL AFTER password_hash;
