import { getSupabase } from "@/lib/supabase";
import { uploadFile, deleteFile } from "@/lib/storage";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("reference_images")
    .select("*")
    .eq("account_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const description = formData.get("description") as string | null;

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "png";
  const imageId = crypto.randomUUID();
  const storagePath = `accounts/${id}/references/${imageId}.${ext}`;

  const publicUrl = await uploadFile(storagePath, buffer, file.type);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("reference_images")
    .insert({
      account_id: id,
      storage_path: storagePath,
      public_url: publicUrl,
      description: description || null,
      uploaded_via: "web",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { reference_id } = await req.json();

  const supabase = getSupabase();
  const { data: ref } = await supabase
    .from("reference_images")
    .select("storage_path")
    .eq("id", reference_id)
    .eq("account_id", id)
    .single();

  if (ref?.storage_path) {
    await deleteFile(ref.storage_path).catch(() => {});
  }

  const { error } = await supabase
    .from("reference_images")
    .delete()
    .eq("id", reference_id)
    .eq("account_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
