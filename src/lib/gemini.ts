import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function generateText(
  systemPrompt: string,
  userPrompt: string,
  options?: { model?: "pro" | "flash"; maxTokens?: number }
): Promise<string> {
  const modelName =
    options?.model === "flash" ? "gemini-2.0-flash" : "gemini-2.5-flash";

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

export type ImageModel = "imagen-3" | "imagen-4" | "nano-banana";

const IMAGE_MODEL_MAP: Record<ImageModel, string> = {
  "imagen-3": "imagen-3.0-generate-002",
  "imagen-4": "imagen-3.0-generate-002", // Will update when Imagen 4 model ID is available
  "nano-banana": "imagen-3.0-generate-002", // Will update with Nano Banana model ID
};

export async function generateImage(
  prompt: string,
  options?: {
    format?: "1:1" | "4:5" | "9:16" | "16:9";
    model?: ImageModel;
  }
): Promise<Buffer> {
  const modelId = IMAGE_MODEL_MAP[options?.model ?? "imagen-3"];

  // Map formats to Imagen-supported aspect ratios
  const aspectMap: Record<string, string> = {
    "1:1": "1:1",
    "4:5": "3:4", // Closest supported ratio
    "9:16": "9:16",
    "16:9": "16:9",
  };

  const response = await ai.models.generateImages({
    model: modelId,
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: aspectMap[options?.format ?? "1:1"],
    },
  });

  const imageData = response.generatedImages?.[0]?.image?.imageBytes;
  if (!imageData) throw new Error("No image generated");

  return Buffer.from(imageData, "base64");
}
