export type TeamMember = "Daniel" | "Natalia" | "Tomás" | "Isa" | "Jorge";

export type PostStatus = "draft" | "ready" | "used";

export type Language = "en" | "es";

export interface Post {
  id: string;
  content_en: string | null;
  content_es: string | null;
  source_url: string | null;
  source_summary: string | null;
  status: PostStatus;
  used_by: TeamMember | null;
  rating: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface TeamMemberProfile {
  id: string;
  name: TeamMember;
  language: Language;
  tone_description: string | null;
  writing_samples: string | null;
}

export interface CompanyContext {
  id: string;
  key: string;
  value: string;
}

// Multi-platform content types

export type Platform = "linkedin" | "instagram" | "twitter";

export type ContentType = "copy_only" | "image_only" | "copy_and_image";

export type ImageFormat = "1:1" | "4:5" | "9:16" | "16:9";

export type ImageModel = "imagen-3" | "imagen-4" | "nano-banana";

export interface Account {
  id: string;
  name: string;
  slug: string;
  color_palette: string[];
  brand_style: string | null;
  logo_path: string | null;
  logo_url: string | null;
  fonts: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContentItem {
  id: string;
  account_id: string;
  platform: Platform;
  content_type: ContentType;
  copy_text: string | null;
  copy_language: Language | null;
  image_storage_path: string | null;
  image_public_url: string | null;
  image_format: ImageFormat | null;
  image_model: ImageModel | null;
  image_prompt: string | null;
  source_url: string | null;
  source_summary: string | null;
  status: PostStatus;
  used_by: string | null;
  rating: number | null;
  tags: string[];
  generated_by: "web" | "slack";
  created_at: string;
  updated_at: string;
}

export interface ReferenceImage {
  id: string;
  account_id: string;
  storage_path: string;
  public_url: string;
  description: string | null;
  uploaded_via: "web" | "slack";
  created_at: string;
}

export interface ImageGeneration {
  id: string;
  content_item_id: string | null;
  account_id: string;
  prompt: string;
  format: ImageFormat;
  model: ImageModel | null;
  storage_path: string;
  public_url: string;
  is_current: boolean;
  created_at: string;
}
