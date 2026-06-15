ALTER TABLE parties
  ADD COLUMN contact_number VARCHAR(20) NULL AFTER leader_name;

ALTER TABLE parties
  ADD COLUMN whatsapp_number VARCHAR(20) NULL AFTER contact_number;
