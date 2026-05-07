const BASE_URL = "https://postsyncer.com/api/v1";

export type PostsyncerPlatform = "linkedin" | "twitter" | "instagram" | "facebook" | "tiktok" | "youtube" | "pinterest" | "threads" | "telegram" | "mastodon" | "bluesky";

export interface PostsyncerAccount {
  id: number;
  workspace_id: number;
  platform: PostsyncerPlatform;
  username: string | null;
  name: string;
  has_expired: boolean;
  is_default: boolean;
}

export interface PostsyncerWorkspace {
  id: number;
  name: string;
  timezone: string;
  accounts: PostsyncerAccount[];
}

export type ScheduleType = "publish_now" | "schedule" | "draft";

export interface CreatePostInput {
  workspaceId: number;
  accountIds: number[];
  text: string;
  scheduleType: ScheduleType;
  scheduledAt?: string; // ISO 8601, required when scheduleType === "schedule"
}

export interface PostsyncerPost {
  id: number | string;
  status?: string;
  scheduled_at?: string | null;
  published_at?: string | null;
  [key: string]: unknown;
}

function getToken(): string {
  const token = process.env.POSTSYNC_API_KEY;
  if (!token) throw new Error("POSTSYNC_API_KEY is not set");
  return token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PostSyncer ${init?.method || "GET"} ${path} failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function listWorkspaces(): Promise<PostsyncerWorkspace[]> {
  return request<PostsyncerWorkspace[]>("/workspaces");
}

export async function listAccounts(): Promise<PostsyncerAccount[]> {
  return request<PostsyncerAccount[]>("/accounts");
}

export async function createPost(input: CreatePostInput): Promise<PostsyncerPost> {
  if (input.scheduleType === "schedule" && !input.scheduledAt) {
    throw new Error("scheduledAt is required when scheduleType is 'schedule'");
  }
  const body: Record<string, unknown> = {
    workspace_id: input.workspaceId,
    account_ids: input.accountIds,
    schedule_type: input.scheduleType,
    content: [{ text: input.text }],
  };
  if (input.scheduledAt) body.scheduled_at = input.scheduledAt;

  return request<PostsyncerPost>("/posts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getPost(id: number | string): Promise<PostsyncerPost> {
  return request<PostsyncerPost>(`/posts/${id}`);
}

export function getActiveWorkspaceId(): number {
  const fromEnv = process.env.POSTSYNC_WORKSPACE_ID;
  if (fromEnv) return parseInt(fromEnv, 10);
  // Default to the only workspace currently connected.
  return 73277;
}
