DO $$ BEGIN
  CREATE TYPE unit_system AS ENUM ('metric', 'imperial');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS unit_system unit_system;

UPDATE suppliers SET unit_system = 'metric'
WHERE unit_system IS NULL
  AND (
    LOWER(weight_unit) IN ('kg', 'kgs', 'kilogram', 'kilograms')
    OR LOWER(volume_unit) IN ('cm', 'cbm', 'centimeter', 'centimeters')
  );

UPDATE suppliers SET unit_system = 'imperial'
WHERE unit_system IS NULL
  AND (
    LOWER(weight_unit) IN ('lb', 'lbs', 'pound', 'pounds')
    OR LOWER(volume_unit) IN ('in', 'inch', 'inches')
  );

UPDATE suppliers SET unit_system = 'metric' WHERE unit_system IS NULL;

ALTER TABLE suppliers ALTER COLUMN unit_system SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN unit_system SET DEFAULT 'metric';