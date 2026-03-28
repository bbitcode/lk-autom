import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const geminiPro = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
export const geminiFlash = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

export async function generateText(
  systemPrompt: string,
  userPrompt: string,
  options?: { model?: "pro" | "flash"; maxTokens?: number }
): Promise<string> {
  const model = options?.model === "flash" ? geminiFlash : geminiPro;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { role: "model", parts: [{ text: systemPrompt }] },
    generationConfig: {
      maxOutputTokens: options?.maxTokens ?? 1500,
    },
  });

  return result.response.text();
}
