-- Remove all image-generation features.
-- Drops the dedicated tables, image columns on content_items,
-- and the brand-kit columns on accounts (logo, palette, fonts, brand_style).
-- Run in Supabase SQL editor. Storage bucket "content-lab" can be deleted manually.

drop table if exists image_generations;
drop table if exists reference_images;

alter table content_items
  drop column if exists image_storage_path,
  drop column if exists image_public_url,
  drop column if exists image_format,
  drop column if exists image_model,
  drop column if exists image_prompt,
  drop column if exists content_type;

alter table accounts
  drop column if exists color_palette,
  drop column if exists brand_style,
  drop column if exists logo_path,
  drop column if exists fonts;
