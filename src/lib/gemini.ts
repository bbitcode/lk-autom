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

const IMAGE_MODEL_ID = "imagen-4.0-generate-001";

export async function generateImage(
  prompt: string,
  options?: {
    format?: "1:1" | "4:5" | "9:16" | "16:9";
  }
): Promise<Buffer> {
  const modelId = IMAGE_MODEL_ID;

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
