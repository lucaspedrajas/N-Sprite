
// Removed Schema import and type annotation to follow @google/genai guidelines
import { GoogleGenAI, Type } from "@google/genai";
import { GamePart, MovementType, Point } from '../types';

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY not found in environment");
  return new GoogleGenAI({ apiKey });
};

export type StreamCallback = (chunk: string, done: boolean) => void;

export const analyzeImageParts = async (
  imageBase64: string,
  onStream?: StreamCallback
): Promise<GamePart[]> => {
  const ai = getAiClient();
  const modelId = "gemini-3-flash-preview";

  const prompt = `
    Analyze this game asset image of 1024x1024 resolution. Decompose it into logical moving parts.
    For each part, provide:
    1. ID and descriptive name.
    2. Mask polygon: array of {x, y} points tracing the part outline in pixel coordinates.
       The polygon should tightly fit the part's shape like a segmentation mask.
    3. Parent ID (hierarchical structure).
    4. Pivot point in world pixel coordinates (x, y) - the rotation/transform center for this part.
    5. movementType: ROTATION, TRANSLATION_HORIZONTAL, TRANSLATION_VERTICAL, STATIC, SCALE_PULSE.
    Ensure parts represent distinct pieces that would be rigged separately.
    Polygons should trace the actual shape, not just axis-aligned rectangles.
  `;

  // Define responseSchema as a plain object using Type from @google/genai
  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        name: { type: Type.STRING },
        parentId: { type: Type.STRING, nullable: true },
        mask: {
          type: Type.OBJECT,
          properties: {
            polygon: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                },
                required: ["x", "y"],
              },
            },
          },
          required: ["polygon"],
        },
        pivot: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
          },
          required: ["x", "y"],
        },
        movementType: {
          type: Type.STRING,
          enum: ["ROTATION", "TRANSLATION_HORIZONTAL", "TRANSLATION_VERTICAL", "STATIC", "SCALE_PULSE"]
        },
      },
      required: ["id", "name", "mask", "pivot", "movementType"],
    },
  };

  // Use streaming API to show response in UI
  const stream = await ai.models.generateContentStream({
    model: modelId,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/png", data: imageBase64 } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
    },
  });

  let fullText = "";

  for await (const chunk of stream) {
    // Stream text chunks as they arrive
    const chunkText = chunk.text;
    if (chunkText) {
      fullText += chunkText;
      // Show prettified preview of the JSON being built
      onStream?.(fullText, false);
    }
  }

  onStream?.(fullText, true);

  if (!fullText) throw new Error("No response from Gemini");
  return JSON.parse(fullText) as GamePart[];
};

export const generateAssetArt = async (
  originalImageBase64: string,
  layoutTemplateBase64: string,
  parts: GamePart[],
  _stylePrompt?: string
): Promise<string> => {
  const ai = getAiClient();
  const modelId = "gemini-3-pro-image-preview";

  // Create number-to-part mapping (matches numbers drawn on atlas)
  const mapping = parts.map((p, index) => {
    const num = index + 1;
    const poly = p.mask.polygon;
    const target = p.atlasRect!;
    const polyStr = poly.map(pt => `(${pt.x},${pt.y})`).join(' ');
    return `- Box #${num} = "${p.name}": (Mask polygon: ${polyStr}) -> (Target rect in layout: [${target.x},${target.y},${target.w},${target.h}])`;
  }).join("\n");

  const fullPrompt = `
TASK: separate the original image into parts.

INPUTS:
1. ORIGINAL_IMAGE: The original object with all parts anotated.
2. LAYOUT_TEMPLATE: A square image with numbered boxes (1, 2, 3...) where you must draw the parts.

NUMBER-TO-PART MAPPING:
${mapping}

INSTRUCTIONS:
- Each numbered box in the LAYOUT_TEMPLATE corresponds to a part from the ORIGINAL_IMAGE.
- Fill each numbered box with the corresponding part from the ORIGINAL_IMAGE without changing the perspective or style.
- DO NOT include the dashed bounding box lines or numbers in your output.
- OUTPUT MUST ONLY BE THE DRAWN PARTS on a clean white background.
- OCCLUSION HANDLING: For parts partially hidden in the original image, generate the ENTIRE part as it would look if fully visible and detached.
- Keep lighting, style, and perspective consistent across all parts.
  `;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/png", data: originalImageBase64 } },
        { inlineData: { mimeType: "image/png", data: layoutTemplateBase64 } },
        { text: fullPrompt }
      ]
    }
  });

  const resParts = response.candidates?.[0]?.content?.parts;
  if (resParts) {
    for (const part of resParts) {
      if (part.inlineData?.data) return part.inlineData.data;
    }
  }

  throw new Error("No image generated by Gemini");
};
