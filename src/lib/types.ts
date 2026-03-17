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
