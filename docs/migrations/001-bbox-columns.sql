-- Broşür hotspot + sayfa desteği için kolonlar.
-- Supabase SQL Editor'de çalıştır: Dashboard → SQL → New query → paste → Run.

alter table weekly_catalogs
  add column if not exists cover_image text,
  add column if not exists pages jsonb default '[]'::jsonb;

alter table products
  add column if not exists bbox jsonb;

-- Scraper'ın bbox yazabilmesi için RLS bypass: service_role key ile yazılır.
-- Anon okuma yeterli.

-- Storage policy (product-crops bucket public):
-- Dashboard → Storage → product-crops → Policies → New policy → "anon read all".
