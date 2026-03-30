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
      maxOutputTokens: options?.maxTokens ?? 1500,
    },
  });

  return response.text ?? "";
}

export async function analyzeImage(
  imageBase64: string,
  prompt: string,
  options?: { maxTokens?: number }
): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: imageBase64,
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      maxOutputTokens: options?.maxTokens ?? 500,
    },
  });

  return response.text ?? "";
}

// --- Image Generation using Gemini native (supports reference images) ---

const IMAGE_MODEL = "gemini-2.5-flash-image";

interface ImageGenerationOptions {
  format?: "1:1" | "4:5" | "9:16" | "16:9";
  referenceImages?: { data: string; mimeType: string }[];
}

export async function generateImage(
  prompt: string,
  options?: ImageGenerationOptions
): Promise<Buffer> {
  const aspectMap: Record<string, string> = {
    "1:1": "1:1",
    "4:5": "3:4",
    "9:16": "9:16",
    "16:9": "16:9",
  };

  // Build content parts: reference images first, then text prompt
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (options?.referenceImages?.length) {
    for (const img of options.referenceImages) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data,
        },
      });
    }
  }

  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: aspectMap[options?.format ?? "1:1"],
      },
    },
  });

  // Extract the generated image from response
  const candidates = response.candidates;
  if (!candidates?.[0]?.content?.parts) {
    throw new Error("No image generated");
  }

  for (const part of candidates[0].content.parts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }

  throw new Error("No image in response");
}
