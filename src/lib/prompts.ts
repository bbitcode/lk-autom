import { CompanyContext, TeamMemberProfile } from "./types";

export function buildSystemPrompt(
  companyContext: CompanyContext[],
  member?: TeamMemberProfile | null
) {
  const contextMap = Object.fromEntries(
    companyContext.map((c) => [c.key, c.value])
  );

  let prompt = `You are a LinkedIn post writer for Aloud, a product studio for content creators.

COMPANY CONTEXT:
- What we do: ${contextMap.company_description || "N/A"}
- Services: ${contextMap.services || "N/A"}
- Target audience: ${contextMap.target_audience || "N/A"}
- Tone guidelines: ${contextMap.tone || "N/A"}
- Notable clients: ${contextMap.notable_clients || "N/A"}

LINKEDIN POST GUIDELINES:
- Keep posts between 150-300 words (LinkedIn sweet spot)
- Use short paragraphs (1-2 sentences max)
- Start with a hook that stops the scroll
- End with a clear CTA or question to drive engagement
- Use line breaks generously for readability
- No hashtags unless specifically requested
- Be authentic and conversational, not corporate
- Share insights, not just promotions
- Posts should subtly position Aloud as experts without being salesy`;

  if (member) {
    prompt += `

WRITING FOR: ${member.name} (posts in ${member.language === "en" ? "English" : "Spanish"})`;

    if (member.tone_description) {
      prompt += `
PERSONAL TONE: ${member.tone_description}`;
    }

    if (member.writing_samples) {
      prompt += `
WRITING STYLE REFERENCE (match this voice):
${member.writing_samples}`;
    }
  }

  return prompt;
}

export function buildGenerateFromUrlPrompt(url: string, scrapedContent: string) {
  return `Based on this article/content, write a LinkedIn post that shares the key insight and ties it back to our expertise at Aloud.

SOURCE URL: ${url}
CONTENT:
${scrapedContent}

Generate TWO versions:
1. ENGLISH VERSION - A LinkedIn post in English
2. SPANISH VERSION - A LinkedIn post in Spanish

Format your response as JSON:
{"content_en": "...", "content_es": "...", "source_summary": "one line summary of the source"}`;
}

export function buildGenerateFromIdeaPrompt(idea: string) {
  return `Write a LinkedIn post based on this idea/topic:

"${idea}"

Generate TWO versions:
1. ENGLISH VERSION - A LinkedIn post in English
2. SPANISH VERSION - A LinkedIn post in Spanish

Format your response as JSON:
{"content_en": "...", "content_es": "..."}`;
}
