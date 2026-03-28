import { NextResponse } from "next/server";
import { getCachedArticles, fetchAndCacheNews } from "@/lib/discover";

export async function GET() {
  try {
    const cached = await getCachedArticles();
    if (cached) {
      return NextResponse.json(cached);
    }

    const relevant = await fetchAndCacheNews();
    return NextResponse.json(relevant);
  } catch (error) {
    console.error("Discover error:", error);
    return NextResponse.json(
      { error: "Failed to fetch feeds" },
      { status: 500 }
    );
  }
}
