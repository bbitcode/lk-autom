import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function generateText(
  systemPrompt: string,
  userPrompt: string,
  options?: { model?: "pro" | "flash"; maxTokens?: number }
): Promise<string> {
  const modelName =
    options?.model === "flash" ? "gemini-2.5-flash" : "gemini-2.5-pro";

  const response = await ai.models.generateContent({
    model: modelName,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      // Higher cap so 2.5-pro thinking tokens don't starve the JSON output.
      maxOutputTokens: options?.maxTokens ?? 8000,
    },
  });

  return response.text ?? "";
}
