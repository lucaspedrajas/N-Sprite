
// Removed Schema import and type annotation to follow @google/genai guidelines
import { GoogleGenAI, Type } from "@google/genai";
import { GamePart, MovementType, BBox } from '../types';

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
    Role: You are an expert Technical Artist and 2D Rigger specializing in skeletal animation.
    Task: Decompose the provided game asset (1024x1024) into a kinematic hierarchy of moving parts for a Cutout Animation rig.

    Process:
    1.  **Visual Analysis**: Identify distinct mechanical or organic components (e.g., "UpperArm", "Forearm", "Wheel", "Piston").
    2.  **Kinematic Logic**: Determine how these parts articulate. Which part drives which? (e.g., The Hip drives the Thigh).
    3.  **Geometry Extraction**: Trace the shape of each part.

    Output format: JSON Array of Objects.
    For each part, provide:
    1.  id: (string) Unique snake_case ID.
    2.  name: (string) Descriptive display name.
    3.  parentId: (string or null) The ID of the bone this part attaches to.
    4.  pivot: {x, y} - The center of rotation in integer pixel coordinates (0-1024). Crucial for correct articulation.
    5.  bbox: [min_x, min_y, max_x, max_y] - The precise bounding box of the part.
    6.  mask_type: "SVG_PATH"
    7.  mask_path: (string) A simplified SVG path data string (d attribute) outlining the part. Use relative commands if possible. Focus on key vertices (corners, curves) rather than pixel-perfect density.
    8.  movementType: Enum [ROTATION, TRANSLATION_AXIS, STATIC, ELASTIC].

    Constraint Checklist & Confidence Score:
    1. Ensure no parts share the exact same bounds unless they overlap significantly.
    2. Ensure the 'pivot' is logically placed (e.g., a head pivots at the neck, not the nose).
    3. Confidence Score: 0-1 (How certain are you of the shape complexity?).
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
        bbox: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Bounding box as [min_x, min_y, max_x, max_y]"
        },
        mask_type: { type: Type.STRING, enum: ["SVG_PATH"] },
        mask_path: { type: Type.STRING, description: "SVG path d attribute" },
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
          enum: ["ROTATION", "TRANSLATION_AXIS", "STATIC", "ELASTIC"]
        },
        confidence: { type: Type.NUMBER, description: "Confidence score 0-1" },
      },
      required: ["id", "name", "bbox", "mask_type", "mask_path", "pivot", "movementType"],
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
    const target = p.atlasRect!;
    const bboxStr = `[${p.bbox.join(',')}]`;
    return `- Box #${num} = "${p.name}": (BBox: ${bboxStr}, SVG Path: ${p.mask_path}) -> (Target rect in layout: [${target.x},${target.y},${target.w},${target.h}])`;
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
