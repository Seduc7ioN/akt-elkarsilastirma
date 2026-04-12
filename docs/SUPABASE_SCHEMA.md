# Supabase Schema

Ilk asama icin 3 temel tablo yeterli:

## `brands`

- `slug` text primary key
- `name` text not null
- `color` text
- `logo_url` text
- `website` text
- `priority` int
- `branches` int
- `segment` text

## `products`

- `id` text primary key
- `brand_slug` text references brands(slug)
- `title` text not null
- `department` text
- `age_group` text
- `main_category` text
- `sub_category` text
- `product_type` text
- `category` text
- `gender` text
- `fit` text
- `neck` text
- `sleeve` text
- `color` text
- `product_code` text
- `comparison_key` text
- `image` text
- `price` numeric
- `previous_price` numeric
- `discount_rate` int
- `currency` text
- `start_date` date
- `end_date` date
- `is_featured` boolean
- `source_type` text
- `source_url` text
- `campaign_label` text
- `campaign_tags` jsonb
- `description` text
- `materials` jsonb
- `material_summary` text
- `availability` text
- `search_text` text

## `comparison_groups`

- `id` text primary key
- `comparison_key` text unique
- `title` text
- `category` text
- `gender` text
- `product_count` int
- `lowest_price` numeric
- `highest_price` numeric
- `best_price_brand_slug` text
- `material_summary` text
- `items` jsonb
- `updated_at` timestamptz

## Not

`scripts/supabase-sync.mjs` mevcut JSON verisini bu tablolara REST uzerinden upsert eder. Sutun adlarini birebir snake_case tutmak entegrasyonu kolaylastirir.
