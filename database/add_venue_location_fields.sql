ALTER TABLE venues
  ADD COLUMN address VARCHAR(255) NULL AFTER whatsapp_number,
  ADD COLUMN google_map_link VARCHAR(500) NULL AFTER address;

