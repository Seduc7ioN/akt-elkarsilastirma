-- Frontend has a broşür görseli viewer ready.
-- To light it up with real brochure pages, add these columns to weekly_catalogs
-- (run in Supabase SQL editor; needs service_role):

alter table weekly_catalogs
  add column if not exists cover_image text,
  add column if not exists pages jsonb default '[]'::jsonb;

-- Scraper should populate:
--   cover_image : URL of the brochure cover (single image)
--   pages       : JSON array of page image URLs, e.g. ["https://.../p1.jpg","https://.../p2.jpg",...]
--
-- Frontend behavior:
--   * catalog hero shows cover_image (falls back to first product image)
--   * a "Broşür sayfaları" section renders each pages[i] as a clickable thumbnail
--   * without these columns, the page still works via the product-image "Broşür galerisi"
