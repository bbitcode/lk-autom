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

export interface ScheduledAtInput {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
  timezone: string; // IANA tz, e.g. "America/Bogota"
}

export interface PostAccountInput {
  id: number;
  platform: PostsyncerPlatform;
}

export interface CreatePostInput {
  workspaceId: number;
  accounts: PostAccountInput[];
  text: string;
  scheduleType: ScheduleType;
  scheduledAt?: ScheduledAtInput;
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

// Per-platform default settings PostSyncer accepts on `accounts[].settings`.
// Most are optional so we only set what we know is required to publish a
// text post — LinkedIn needs visibility (defaults to PUBLIC anyway) and
// Instagram/Facebook accept POST/REELS/STORIES. Empty for the rest.
function defaultSettingsFor(platform: PostsyncerPlatform): Record<string, unknown> {
  switch (platform) {
    case "linkedin":
      return { visibility: "PUBLIC" };
    case "instagram":
      return { post_type: "POST" };
    case "facebook":
      return { post_type: "POST" };
    default:
      return {};
  }
}

export async function createPost(input: CreatePostInput): Promise<PostsyncerPost> {
  if (input.scheduleType === "schedule" && !input.scheduledAt) {
    throw new Error("scheduledAt is required when scheduleType is 'schedule'");
  }

  const body: Record<string, unknown> = {
    workspace_id: input.workspaceId,
    schedule_type: input.scheduleType,
    content: [{ text: input.text }],
    accounts: input.accounts.map((a) => ({
      id: a.id,
      settings: defaultSettingsFor(a.platform),
    })),
  };

  if (input.scheduledAt) {
    body.scheduled_at = {
      date: input.scheduledAt.date,
      time: input.scheduledAt.time,
      timezone: input.scheduledAt.timezone,
    };
  }

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
