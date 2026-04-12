create table if not exists public.brands (
  slug text primary key,
  name text not null,
  color text,
  logo_url text,
  website text,
  priority integer,
  branches integer,
  segment text
);

create table if not exists public.products (
  id text primary key,
  brand_slug text not null references public.brands(slug) on delete cascade,
  title text not null,
  category text,
  gender text,
  fit text,
  neck text,
  sleeve text,
  color text,
  product_code text,
  comparison_key text,
  image text,
  price numeric(10,2),
  previous_price numeric(10,2),
  discount_rate integer default 0,
  currency text default 'TRY',
  start_date date,
  end_date date,
  is_featured boolean default false,
  source_type text,
  source_url text,
  campaign_label text,
  campaign_tags jsonb default '[]'::jsonb,
  description text,
  materials jsonb default '[]'::jsonb,
  material_summary text,
  availability text,
  search_text text
);

create index if not exists idx_products_brand_slug on public.products(brand_slug);
create index if not exists idx_products_comparison_key on public.products(comparison_key);

create table if not exists public.comparison_groups (
  id text primary key,
  comparison_key text unique not null,
  title text,
  category text,
  gender text,
  product_count integer default 0,
  lowest_price numeric(10,2),
  highest_price numeric(10,2),
  best_price_brand_slug text,
  material_summary text,
  items jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

create index if not exists idx_comparison_groups_key on public.comparison_groups(comparison_key);
