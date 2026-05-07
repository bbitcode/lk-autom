import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE_NAME = "eywa_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function GET() {
  const jar = await cookies();
  const expected = process.env.APP_PASSWORD;
  const got = jar.get(COOKIE_NAME)?.value;
  return NextResponse.json({ authed: !!expected && got === expected });
}

export async function POST(req: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "APP_PASSWORD not configured on the server" },
      { status: 500 }
    );
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || password !== expected) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(COOKIE_NAME, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
