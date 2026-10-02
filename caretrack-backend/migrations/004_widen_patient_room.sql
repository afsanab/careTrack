-- Room numbers were VARCHAR(20), which rejected ordinary values like
-- "214-A West" and any slightly longer test input. Align with other short text fields.
ALTER TABLE patients ALTER COLUMN room TYPE VARCHAR(120);
