ALTER TABLE parties
  ADD COLUMN its_no VARCHAR(20) NULL AFTER id;

ALTER TABLE parties
  ADD COLUMN leader_name VARCHAR(150) NULL AFTER its_no;

ALTER TABLE parties
  ADD UNIQUE KEY uq_parties_its_no (its_no);

-- Populate ITS numbers for every existing party before switching party login to ITS No only.
-- Example:
-- UPDATE parties SET its_no = '12345678' WHERE id = 1;
-- UPDATE parties SET leader_name = 'Leader Name' WHERE id = 1;

-- After every existing row has a non-empty ITS number, enforce NOT NULL:
-- ALTER TABLE parties MODIFY its_no VARCHAR(20) NOT NULL;
-- ALTER TABLE parties MODIFY leader_name VARCHAR(150) NOT NULL;
