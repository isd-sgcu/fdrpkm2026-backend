-- Walk rally activities seed. 3 workshops, 4 museums, 1 minigame.
-- Codes sourced from rpkm2026-frontend/src/components/walkrally/events/events.json
-- and minigameActivity.ts (MINIGAME_ACTIVITY_CODE) -- must match frontend activity ids exactly,
-- the frontend sends `id` straight through as `code` with no transform.
-- id left to gen_random_uuid() default; nothing else references activity id, only code.
INSERT INTO walk_rally_activities (code, kind) VALUES
  ('lookchoop', 'workshop'),
  ('pimsennam', 'workshop'),
  ('painttungpa', 'workshop'),
  ('cu-museum', 'museum'),
  ('cu-history', 'museum'),
  ('natural-history-museum', 'museum'),
  ('living-plant-museum', 'museum'),
  ('minigame', 'minigame')
ON CONFLICT (code) DO UPDATE SET kind = EXCLUDED.kind;
