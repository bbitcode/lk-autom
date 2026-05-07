export type TeamMember = "Daniel" | "Natalia" | "Tomás" | "Isa" | "Jorge";

export type PostStatus = "draft" | "ready" | "used";

export type Language = "en" | "es";

export type SourceType = "ai_generated" | "manual";

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

export interface Account {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContentItem {
  id: string;
  account_id: string;
  platform: Platform;
  copy_text: string | null;
  copy_language: Language | null;
  source_url: string | null;
  source_summary: string | null;
  source_type: SourceType;
  status: PostStatus;
  used_by: string | null;
  rating: number | null;
  tags: string[];
  generated_by: "web" | "slack";
  created_at: string;
  updated_at: string;
  approved_by: string | null;
  approved_at: string | null;
  postsyncer_post_id: string | null;
  postsyncer_account_ids: number[] | null;
  published_to: string[];
  scheduled_at: string | null;
  publish_language: Language | null;
}
