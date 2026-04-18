-- Sosyal medya gonderim state tablosu.
-- Telegram/Instagram botu hangi urunu daha once paylastiysa burada isaretler,
-- boylece ayni urun tekrar paylasilmaz.
--
-- Supabase SQL editor'de (service_role ile) calistir:

create table if not exists social_posts (
  id bigint generated always as identity primary key,
  product_id text not null,
  channel text not null,
  message_id text,
  posted_at timestamptz not null default now(),
  unique (product_id, channel)
);

-- Eger tabloyu onceki katı check constraint'le olusturduysan temizle:
alter table social_posts
  drop constraint if exists social_posts_channel_check;

-- channel degerleri: 'telegram_spot', 'telegram_digest', 'instagram_reels'

create index if not exists social_posts_posted_at_idx
  on social_posts (posted_at desc);

-- Anonim okuma izni (script SUPABASE_ANON_KEY ile liste cekecek):
alter table social_posts enable row level security;

drop policy if exists social_posts_read on social_posts;
create policy social_posts_read on social_posts
  for select using (true);

-- Yazma icin script SUPABASE_SERVICE_KEY kullaniyor (RLS bypass).
-- Anon yazima izin vermek istersen asagiyi acabilirsin (onerilmez):
-- create policy social_posts_insert on social_posts for insert with check (true);
