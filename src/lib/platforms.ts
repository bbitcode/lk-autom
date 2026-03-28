import { Platform } from "./types";

interface PlatformConfig {
  name: string;
  maxChars: number;
  style: string;
  defaultFormat: "1:1" | "4:5" | "9:16" | "16:9";
}

export const PLATFORMS: Record<Platform, PlatformConfig> = {
  linkedin: {
    name: "LinkedIn",
    maxChars: 3000,
    style:
      "Professional thought leadership. 150-300 words. Short paragraphs (1-2 sentences). Hook opening, conversational tone, end with a question or CTA. No hashtags unless requested.",
    defaultFormat: "16:9",
  },
  instagram: {
    name: "Instagram",
    maxChars: 2200,
    style:
      "Visual-first, casual and engaging. 50-150 words. Conversational, use emojis sparingly. Hook in the first line (shows before 'more'). Include a call to action. Can use relevant hashtags (5-10).",
    defaultFormat: "1:1",
  },
  twitter: {
    name: "Twitter / X",
    maxChars: 280,
    style:
      "Punchy and concise. Max 280 characters. One strong idea per tweet. Provocative or insightful. No filler words. Can use 1-2 hashtags if relevant.",
    defaultFormat: "16:9",
  },
};

export function buildPlatformCopyPrompt(
  platform: Platform,
  idea: string,
  language: "en" | "es"
): string {
  const config = PLATFORMS[platform];
  const langName = language === "en" ? "English" : "Spanish";

  return `Write a ${config.name} post based on this idea/topic:

"${idea}"

PLATFORM RULES for ${config.name}:
- Max characters: ${config.maxChars}
- Style: ${config.style}

Write the post in ${langName}.

Return ONLY the post text, no JSON, no labels, no quotes. Just the raw post content ready to copy-paste.`;
}
