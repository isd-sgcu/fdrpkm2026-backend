-- House capacity seed. Sizes/codes sourced from rpkm2026-frontend/src/consts/house.ts.
-- Tiers: S<=59, M<=89, L<=119, XL<=199, XXL>200 (seeded at max-of-tier).
INSERT INTO houses (code, capacity) VALUES
  ('house01', 59),  -- S
  ('house02', 59),  -- S
  ('house03', 59),  -- S
  ('house04', 59),  -- S
  ('house05', 59),  -- S
  ('house06', 59),  -- S
  ('house07', 59),  -- S
  ('house08', 59),  -- S
  ('house09', 59),  -- S
  ('house10', 89),  -- M
  ('house11', 89),  -- M
  ('house12', 89),  -- M
  ('house13', 119), -- L
  ('house14', 119), -- L
  ('house15', 119), -- L
  ('house16', 199), -- XL
  ('house17', 199), -- XL
  ('house18', 199), -- XL
  ('house19', 199), -- XL
  ('house20', 199), -- XL
  ('house21', 250), -- XXL
  ('house22', 250)  -- XXL
ON CONFLICT (code) DO UPDATE SET capacity = EXCLUDED.capacity;
