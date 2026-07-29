-- Corrige el horario oficial sembrado por 0001 (07:45-17:10) al oficial 07:30-17:30.
-- Condicional: solo actualiza si sigue en el valor viejo, para no pisar una personalización
-- manual hecha desde la UI. Idempotente.
UPDATE "work_schedules"
SET "start_time" = '07:30', "end_time" = '17:30'
WHERE "name" = 'default' AND "start_time" = '07:45' AND "end_time" = '17:10';
