import { getSupabaseAdmin } from "./supabase";

const BUCKET = "content-lab";

export async function uploadFile(
  path: string,
  file: Buffer,
  contentType: string = "image/png"
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  return getPublicUrl(path);
}

export function getPublicUrl(path: string): string {
  const supabase = getSupabaseAdmin();
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteFile(path: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}
