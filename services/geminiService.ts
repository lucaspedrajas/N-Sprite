// Multi-Agent Architecture for Kinematic Decomposition
import { GoogleGenAI, Type } from "@google/genai";
import {
  GamePart,
  PartManifest,
  WorkerGeometry,
  SVGPrimitive,
  MovementType,
  PartTypeHint,
  PipelineDebugData,
  PipelineStage,
  WorkerError,
  WorkerEvent,
  WorkerHistory
} from '../types';
import { createGeometryComposite } from "../utils/canvasUtils";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY not found in environment");
  return new GoogleGenAI({ apiKey });
};

export type StreamCallback = (chunk: string, done: boolean) => void;
export type StageCallback = (stage: string, message: string) => void;
export type DebugCallback = (data: PipelineDebugData) => void;

// Retry options for conversational mode
export interface RetryOptions {
  mode: 'fresh' | 'conversational';
  userFeedback?: string; // Optional user comment for conversational mode
  previousResult?: string; // JSON of previous result for context
  compositedImage?: string; // Base64 image with shape overlay for visual feedback
}

export type StageRetryCallback = (stage: 'director' | 'worker' | 'architect', options: RetryOptions, targetId?: string) => Promise<void>;

// Shared debug state for logging
let debugData: PipelineDebugData = {
  directorOutput: null,
  workerOutputs: [],
  workerErrors: [],
  architectOutput: null,
  apiLogs: [],
  workerHistory: []
};

const addApiLog = (stage: PipelineStage, prompt: string, output: string, duration: number) => {
  debugData.apiLogs.push({
    id: `${stage}-${Date.now()}`,
    stage,
    timestamp: Date.now(),
    input: { prompt, hasImage: true },
    output,
    duration
  });
};

/**
 * Generic helper to call Gemini with standard patterns for this pipeline.
 * Handles client init, logging, streaming, JSON parsing, and error wrapping.
 */
async function callGemini<T>(
  stage: PipelineStage,
  systemInstruction: string,
  userContent: Array<string | { inlineData: { mimeType: string; data: string } } | { text: string }>,
  schema: any,
  options: {
    onStream?: StreamCallback;
    modelId?: string;
  } = {}
): Promise<T> {
  const ai = getAiClient();
  const modelId = options.modelId || "gemini-3-flash-preview";
  const startTime = Date.now();

  const formattedContents = userContent.map(c => {
    if (typeof c === 'string') return { text: c };
    return c;
  });

  // Prepend system instruction as the first text part if needed, 
  // or just rely on the prompt structure. 
  // For Gemini 1.5/2.0/3.0, system instructions can be separate or part of the prompt.
  // We'll treat the first string in userContent or systemInstruction as part of the prompt flow.
  // To keep it simple and match previous behavior: combine systemInstruction + user content.

  const finalPromptText = `${systemInstruction}\n${formattedContents.filter(c => 'text' in c).map(c => (c as any).text).join('\n')}`;

  // Clean up content for API call - ensure we don't send duplicate text if we just merged it for logging
  // Actually, let's just send the array as is, but prepend system instruction text to the first text part or add a new one.
  const apiContents = [
    { text: systemInstruction },
    ...formattedContents
  ];

  const responseSchema = {
    type: Type.OBJECT, // Wrapper to ensure JSON is valid
    properties: {
      result: schema
      // We wrap the actual schema in a "result" property or just return the schema directly?
      // Google GenAI SDK schema handling can be strict.
      // Previous code used direct schema. Let's stick to that.
    }
  };

  // NOTE: Previous implementation didn't wrap in 'result', it passed Schema directly.
  // We will pass the schema directly as `responseSchema`.

  try {
    const stream = await ai.models.generateContentStream({
      model: modelId,
      contents: {
        parts: apiContents as any[]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        maxOutputTokens: 20000,
      }
    });

    let fullText = "";
    for await (const chunk of stream) {
      if (chunk.text) {
        fullText += chunk.text;
        options.onStream?.(fullText, false);
      }
    }
    options.onStream?.(fullText, true);

    if (!fullText) throw new Error(`${stage}: No response`);

    addApiLog(stage, finalPromptText, fullText, Date.now() - startTime);

    return JSON.parse(fullText) as T;
  } catch (err: any) {
    // If stream fails, fallback to simple generate if needed, or just throw.
    // Enhanced error logging
    const duration = Date.now() - startTime;
    addApiLog(stage, finalPromptText, `ERROR: ${err.message}`, duration);
    throw err;
  }
}

// ============================================
// Unified Stage 1: Director - Discovery & Grounding
// ============================================

const runDirector = async (
  imageBase64: string,
  options: RetryOptions = { mode: 'fresh' },
  onStream?: StreamCallback,
  onDebug?: DebugCallback
): Promise<PartManifest[]> => {
  const isConversational = options.mode === 'conversational';

  const baseTask = `
Role: You are a Senior 2D Rigger specializing in kinematic mechanics.
Task: ${isConversational ? 'Refine the breakdown' : 'Identify the main "Rigid Bodies"'} of this game asset.

IMPORTANT: Use RELATIVE coordinates (0.0 to 1.0).

Definition of a "Part":
A part is a group of visual elements that moves as a single rigid unit.
- If multiple objects move together (e.g., rider + saddle, wheel + hubcap), they must be ONE part.
- Ignore internal seams/bolts unless they are mechanical joints.
`;

  const feedbackContext = isConversational ? `
Your previous analysis:
${options.previousResult}

${options.userFeedback ? `User feedback: "${options.userFeedback}"` : 'The previous breakdown had issues.'}

CRITICAL INSTRUCTION: MERGE parts that move together.
- Connect bolted/welded parts.
- Keep decorations with their parent body.
` : `
Rules:
- Prioritize minimal, functional parts.
- Group static attachments into parent body.
`;

  const outputFormat = `
For each Rigid Body, provide:
1. id: Unique snake_case identifier
2. name: Human-readable name
3. visual_anchor: [x, y] (0-1 relative) INSIDE the part , if the part is a wheel, the visual anchor should be the center of the wheel
4. bbox: [min_x, min_y, max_x, max_y] (0-1 relative) Rough bounding box
5. type_hint: [WHEEL, LIMB, BODY, PISTON, JOINT, DECORATION, OTHER]
6. segmentation_strategy: 'gemini' OR 'sam3'
   - Choose 'gemini' for: Simple geometric parts (wheels, straight pistons, boxy joints).
   - Choose 'sam3' for: Complex organic shapes (limbs, hair, clothing, irregular bodies).
`;

  const prompt = `${baseTask}\n${feedbackContext}\n${outputFormat}`;

  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        name: { type: Type.STRING },
        visual_anchor: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "[x, y] relative coordinates 0-1"
        },
        bbox: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "[min_x, min_y, max_x, max_y] relative coordinates 0-1"
        },
        type_hint: {
          type: Type.STRING,
          enum: ["WHEEL", "LIMB", "BODY", "PISTON", "JOINT", "DECORATION", "OTHER"]
        },
        segmentation_strategy: {
          type: Type.STRING,
          enum: ["gemini", "sam3"],
          description: "Use 'gemini' for simple shapes (circle, rect). Use 'sam3' for complex/irregular organic shapes."
        }
      },
      required: ["id", "name", "visual_anchor", "bbox", "type_hint", "segmentation_strategy"]
    }
  };

  const result = await callGemini<PartManifest[]>(
    'director',
    prompt,
    [{ inlineData: { mimeType: "image/png", data: imageBase64 } }],
    schema,
    { onStream }
  );

  debugData.directorOutput = result;
  // If fresh run, plain reset. If retry, we might want to be careful, but architect usually needs fresh flows if director changes.
  if (options.mode === 'fresh') {
    debugData.workerOutputs = [];
    debugData.workerErrors = [];
    debugData.architectOutput = null;
  } else {
    // On director retry, we invalidate subsequent stages usually
    debugData.workerOutputs = [];
    debugData.workerErrors = [];
    debugData.architectOutput = null;
  }

  onDebug?.({ ...debugData });
  return result;
};

// ============================================
// Unified Stage 2: Worker - Geometry Extraction
// ============================================

const runWorker = async (
  imageBase64: string,
  manifest: PartManifest,
  options: RetryOptions = { mode: 'fresh' },
  onDebug?: DebugCallback
): Promise<WorkerGeometry> => {
  const isConversational = options.mode === 'conversational';
  const MAX_TURNS = 3;

  const basePrompt = `
Role: You are a Geometry Worker reconstructing a single part.
Focus Area: "${manifest.name}" (id: ${manifest.id})
Type: ${manifest.type_hint}
Anchor: [${manifest.visual_anchor.join(', ')}]
Expected Bounding Box: [${manifest.bbox?.join(', ') || 'unknown'}]
`;

  let prompt = basePrompt;
  const userContent: any[] = [{ inlineData: { mimeType: "image/png", data: imageBase64 } }];

  if (isConversational) {
    if (options.compositedImage) {
      userContent.push({ inlineData: { mimeType: "image/png", data: options.compositedImage } });
      prompt += `\nThe SECOND image shows your previous shape (colored outline) overlaid on the original.\n`;
    }

    let prevInfo = "";
    if (options.previousResult) {
      try {
        const prev = JSON.parse(options.previousResult);
        prevInfo = `Previous Shape: ${prev.shape.type}, BBox: [${prev.bbox.join(',')}]`;
      } catch {
        prevInfo = `Previous raw: ${options.previousResult}`;
      }
    }

    prompt += `
Your previous extraction: ${prevInfo}
${options.userFeedback ? `User feedback: "${options.userFeedback}"` : 'Improve the shape match based on the visual overlay.'}
`;
  } else {
    prompt += `
Task:
1. IGNORE occluding objects.
2. Fit an SVG primitive (circle, rect, ellipse, path).
   - EXTREMELY IMPORTANT: For "path", you must trace the object contour PRECISELY.
   - Do not simplify curves. Use as many points as needed.
   - Do not hallucinate details, follow the pixels.
3. Provide tight bounding box [min_x, min_y, max_x, max_y].
`;
  }

  const shapeSchema = {
    type: Type.OBJECT,
    properties: {
      type: { type: Type.STRING, enum: ["circle", "rect", "ellipse", "path"] },
      cx: { type: Type.NUMBER },
      cy: { type: Type.NUMBER },
      r: { type: Type.NUMBER },
      x: { type: Type.NUMBER },
      y: { type: Type.NUMBER },
      width: { type: Type.NUMBER },
      height: { type: Type.NUMBER },
      rx: { type: Type.NUMBER },
      ry: { type: Type.NUMBER },
      d: { type: Type.STRING }
    },
    required: ["type"]
  };

  const schema = {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      shape: shapeSchema,
      bbox: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER },
        description: "[min_x, min_y, max_x, max_y] relative 0-1"
      },
      amodal_completed: { type: Type.BOOLEAN },
      confidence: { type: Type.NUMBER }
    },
    required: ["id", "shape", "bbox", "amodal_completed", "confidence"]
  };

  // --- Step 1: Initial Generation ---
  let resultRaw = await callGemini<any>('workers', prompt, userContent, schema);
  let geometry: WorkerGeometry = {
    id: manifest.id,
    shape: normalizeShape(resultRaw.shape),
    bbox: resultRaw.bbox,
    amodal_completed: resultRaw.amodal_completed,
    confidence: resultRaw.confidence
  };

  // Log Initial Event
  const initialEvent: WorkerEvent = {
    timestamp: Date.now(),
    turn: 0,
    type: 'generation',
    prompt: prompt,
    shape: geometry.shape
  };

  // Update history
  let history = debugData.workerHistory.find(h => h.manifestId === manifest.id);
  if (!history) {
    history = { manifestId: manifest.id, events: [] };
    debugData.workerHistory.push(history);
  }
  history.events.push(initialEvent);

  // --- Step 2: Self-Reflection Loop ---
  // Only enter loop if not explicitly requested to skip (could add that option later)
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    // A. Generate Composite
    const compositeBase64 = await createGeometryComposite(imageBase64, geometry.shape, geometry.bbox);

    // B. Evaluate
    const evalPrompt = `
Role: You are a QA Specialist checking the geometry fit.
Task: Evaluate if the GREEN outline matches the part "${manifest.name}" (Type: ${manifest.type_hint}) in the image.
The CYAN dashed box is the bounding box.

Criteria:
1. Does the shape follow the visual contour?
2. Is the bounding box tight?
3. Are important features included?

Respond with VERDICT: 'GOOD' or 'IMPROVE'.
If 'IMPROVE', provide specific feedback on how to fix it (e.g., "shrink width", "move up", "trace the handle better").
`;

    const evalSchema = {
      type: Type.OBJECT,
      properties: {
        verdict: { type: Type.STRING, enum: ["GOOD", "IMPROVE"] },
        feedback: { type: Type.STRING }
      },
      required: ["verdict", "feedback"]
    };

    const evalResult = await callGemini<{ verdict: string; feedback: string }>(
      'workers', // Log as worker stage
      evalPrompt,
      [
        { inlineData: { mimeType: "image/png", data: imageBase64 } },
        { inlineData: { mimeType: "image/png", data: compositeBase64 } }
      ],
      evalSchema
    );

    // Log Evaluation Event
    history.events.push({
      timestamp: Date.now(),
      turn,
      type: 'evaluation',
      prompt: evalPrompt,
      feedback: evalResult.feedback,
      verdict: evalResult.verdict as 'GOOD' | 'IMPROVE',
      compositeImageBase64: compositeBase64
    });

    if (evalResult.verdict === 'GOOD') {
      addApiLog('workers', `Self-Eval Turn ${turn}`, `Verdict: GOOD. Stopping.`, 0);
      break;
    }

    addApiLog('workers', `Self-Eval Turn ${turn}`, `Verdict: IMPROVE. Feedback: ${evalResult.feedback}`, 0);

    // C. Refine
    const refinePrompt = `
Role: Geometry Worker.
Task: IMPROVE the shape based on QA feedback.

Target: "${manifest.name}"
QA Feedback: "${evalResult.feedback}"

Previous Shape: ${geometry.shape.type}
`;

    // Re-run generation with feedback
    // NOTE: We only send the original image and composite, context is in the prompt
    resultRaw = await callGemini<any>(
      'workers',
      refinePrompt,
      [
        { inlineData: { mimeType: "image/png", data: imageBase64 } },
        { inlineData: { mimeType: "image/png", data: compositeBase64 } }
      ],
      schema
    );

    geometry = {
      id: manifest.id,
      shape: normalizeShape(resultRaw.shape),
      bbox: resultRaw.bbox,
      amodal_completed: resultRaw.amodal_completed,
      confidence: resultRaw.confidence
    };

    // Log Refinement Event
    history.events.push({
      timestamp: Date.now(),
      turn,
      type: 'generation',
      prompt: refinePrompt,
      shape: geometry.shape
    });
  }

  // Update debug data
  if (isConversational) {
    debugData.workerErrors = debugData.workerErrors.filter(e => e.manifestId !== manifest.id);
  }

  const idx = debugData.workerOutputs.findIndex(w => w.id === manifest.id);
  if (idx >= 0) debugData.workerOutputs[idx] = geometry;
  else debugData.workerOutputs.push(geometry);

  onDebug?.({ ...debugData });
  return geometry;
};

const normalizeShape = (raw: any): SVGPrimitive => {
  switch (raw.type) {
    case 'circle': return { type: 'circle', cx: raw.cx, cy: raw.cy, r: raw.r };
    case 'rect': return { type: 'rect', x: raw.x, y: raw.y, width: raw.width, height: raw.height, rx: raw.rx };
    case 'ellipse': return { type: 'ellipse', cx: raw.cx, cy: raw.cy, rx: raw.rx, ry: raw.ry };
    case 'path': return { type: 'path', d: raw.d };
    default: return { type: 'rect', x: 0, y: 0, width: 1, height: 1 };
  }
};

// ============================================
// Unified Stage 3: Architect - Hierarchy & Rigging
// ============================================

const runArchitect = async (
  imageBase64: string,
  manifests: PartManifest[],
  geometries: WorkerGeometry[],
  options: RetryOptions = { mode: 'fresh' },
  onStream?: StreamCallback,
  onDebug?: DebugCallback
): Promise<GamePart[]> => {
  const isConversational = options.mode === 'conversational';

  const geoSummary = geometries.map(g => {
    const m = manifests.find(m => m.id === g.id);
    if (!m) return '';
    return `- ${m.name} (${g.id}): type=${g.shape.type}, bbox=[${g.bbox.join(',')}], type_hint=${m.type_hint}`;
  }).join('\n');

  const basePrompt = `
Role: You are the Rigging Architect.
Parts with extracted geometry (0-1 relative):
${geoSummary}
`;

  let instructions = "";
  if (isConversational) {
    instructions = `
Your previous rigging:
${options.previousResult}
${options.userFeedback ? `User feedback: "${options.userFeedback}"` : 'Please re-analyze.'}

Updated rigging instructions:
1. BUILD HIERARCHY: Assign parentId (null for roots).
2. DEFINE PIVOTS: {x, y} at joints.
3. ASSIGN MOVEMENT: ROTATION, SLIDING, FIXED, ELASTIC.
`;
  } else {
    instructions = `
Task:
1. BUILD HIERARCHY: Parent smaller parts to larger bodies. Null for root.
2. DEFINE PIVOTS: Centers for wheels, joints for limbs.
3. ASSIGN MOVEMENT: [ROTATION, SLIDING, FIXED, ELASTIC].
`;
  }

  const prompt = `${basePrompt}\n${instructions}`;

  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        name: { type: Type.STRING },
        parentId: { type: Type.STRING, nullable: true },
        pivot: {
          type: Type.OBJECT,
          properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } },
          required: ["x", "y"]
        },
        movementType: {
          type: Type.STRING,
          enum: ["ROTATION", "SLIDING", "FIXED", "ELASTIC"]
        }
      },
      required: ["id", "name", "parentId", "pivot", "movementType"]
    }
  };

  const rigging = await callGemini<Array<{
    id: string;
    name: string;
    parentId: string | null;
    pivot: { x: number; y: number };
    movementType: string;
  }>>(
    'architect',
    prompt,
    [{ inlineData: { mimeType: "image/png", data: imageBase64 } }],
    schema,
    { onStream }
  );

  const parts = rigging.map(rig => {
    const geo = geometries.find(g => g.id === rig.id);
    const manifest = manifests.find(m => m.id === rig.id);
    if (!geo || !manifest) throw new Error(`Missing data for part ${rig.id}`);

    return {
      id: rig.id,
      name: rig.name,
      parentId: rig.parentId,
      shape: geo.shape,
      bbox: geo.bbox as [number, number, number, number],
      pivot: rig.pivot,
      movementType: rig.movementType as MovementType,
      type_hint: manifest.type_hint as PartTypeHint,
      confidence: geo.confidence
    };
  });

  debugData.architectOutput = parts;
  onDebug?.({ ...debugData });
  return parts;
};

// ============================================
// Orchestrator - Full Pipeline
// ============================================

export const runDirectorOnly = async (
  imageBase64: string,
  onStream?: StreamCallback,
  onStage?: StageCallback,
  onDebug?: DebugCallback
): Promise<PipelineDebugData> => {
  debugData = {
    directorOutput: null,
    workerOutputs: [],
    workerErrors: [],
    architectOutput: null,
    apiLogs: [],
    workerHistory: []
  };

  onStage?.('director', 'Discovering parts...');
  await runDirector(imageBase64, { mode: 'fresh' }, onStream, onDebug);
  return { ...debugData };
};

export const runWorkersOnly = async (
  imageBase64: string,
  manifests: PartManifest[],
  onStream?: StreamCallback,
  onStage?: StageCallback,
  onDebug?: DebugCallback,
  existingDebugData?: PipelineDebugData
): Promise<PipelineDebugData> => {
  if (existingDebugData) {
    debugData = { ...existingDebugData, directorOutput: manifests };
  } else {
    debugData.directorOutput = manifests;
  }

  // Clear previous worker data
  debugData.workerOutputs = [];
  debugData.workerErrors = [];
  onDebug?.({ ...debugData });

  const BATCH_SIZE = 8;
  const workerResults: PromiseSettledResult<WorkerGeometry>[] = [];

  for (let i = 0; i < manifests.length; i += BATCH_SIZE) {
    const chunk = manifests.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(manifests.length / BATCH_SIZE);

    onStage?.('workers', `Processing batch ${batchNum}/${totalBatches}...`);

    const batchResults = await Promise.allSettled(
      chunk.map(m => runWorker(imageBase64, m, { mode: 'fresh' }, onDebug))
    );
    workerResults.push(...batchResults);
  }

  // Handle errors
  workerResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      const manifest = manifests[index];
      const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      debugData.workerErrors.push({
        manifestId: manifest.id,
        manifestName: manifest.name,
        error: errorMsg,
        retryCount: 0
      });
    }
  });

  onDebug?.({ ...debugData });
  return { ...debugData };
};

export const runArchitectOnly = async (
  imageBase64: string,
  workerOutputs: WorkerGeometry[],
  onStream?: StreamCallback,
  onStage?: StageCallback,
  onDebug?: DebugCallback,
  existingDebugData?: PipelineDebugData
): Promise<PipelineDebugData> => {
  if (existingDebugData) {
    debugData = { ...existingDebugData, workerOutputs };
  } else {
    debugData.workerOutputs = workerOutputs;
  }
  debugData.architectOutput = null;
  onDebug?.({ ...debugData });

  const manifests = debugData.directorOutput;
  if (!manifests) throw new Error('No director output found');

  onStage?.('architect', 'Building hierarchy...');
  await runArchitect(imageBase64, manifests, workerOutputs, { mode: 'fresh' }, onStream, onDebug);

  return { ...debugData };
};

export const retryWorker = async (
  imageBase64: string,
  manifestId: string,
  onDebug?: DebugCallback
): Promise<WorkerGeometry | null> => {
  // This is a simple retry without feedback, internally uses fresh mode or we could map it.
  // Preserving original signature for compatibility if UI calls this without feedback.
  // But since we want unified, let's treat it as a fresh retry of that specific worker.

  const manifest = debugData.directorOutput?.find(m => m.id === manifestId);
  if (!manifest) return null;

  try {
    return await runWorker(imageBase64, manifest, { mode: 'fresh' }, onDebug);
  } catch (e) {
    // Error handling is inside runWorker for debugData updates? 
    // No, runWorker updates outputs, but let's handle error logging here if it propagates.
    const errorEntry = debugData.workerErrors.find(e => e.manifestId === manifestId);
    if (errorEntry) {
      errorEntry.retryCount++;
      errorEntry.error = e instanceof Error ? e.message : String(e);
    }
    onDebug?.({ ...debugData });
    return null;
  }
};

// Retry with feedback exposed as generic export if needed, or UI calls run* directly with options?
// The original code had specific `retryDirector`, `retryArchitect`.
// We should expose wrappers or expect the UI to switch to using the main functions with options.
// To support the existing UI calls likely expecting these names:

export const retryDirector = async (
  imageBase64: string,
  options: RetryOptions,
  onStream?: StreamCallback,
  onDebug?: DebugCallback
): Promise<PartManifest[]> => {
  return runDirector(imageBase64, options, onStream, onDebug);
};

export const retryArchitect = async (
  imageBase64: string,
  options: RetryOptions,
  onStream?: StreamCallback,
  onDebug?: DebugCallback
): Promise<GamePart[]> => {
  const manifests = debugData.directorOutput!;
  const geometries = debugData.workerOutputs;
  return runArchitect(imageBase64, manifests, geometries, options, onStream, onDebug);
};

export const retryWorkerWithFeedback = async (
  imageBase64: string,
  manifestId: string,
  options: RetryOptions,
  onDebug?: DebugCallback
): Promise<WorkerGeometry | null> => {
  const manifest = debugData.directorOutput?.find(m => m.id === manifestId);
  if (!manifest) return null;
  try {
    return await runWorker(imageBase64, manifest, options, onDebug);
  } catch (e) {
    // Similar error handling
    return null;
  }
};

export const getDebugData = (): PipelineDebugData => ({ ...debugData });

export const generateAssetArt = async (
  originalImageBase64: string,
  layoutTemplateBase64: string,
  parts: GamePart[],
  _stylePrompt?: string
): Promise<string> => {
  const ai = getAiClient();
  const modelId = "gemini-3-pro-image-preview"; // Keeping this separate as it doesn't fit the generic JSON schema pattern easily

  const mapping = parts.map((p, index) => {
    const num = index + 1;
    const target = p.atlasRect!;
    const bboxStr = `[${p.bbox.map(v => v.toFixed(3)).join(',')}]`;
    const shapeDesc = p.shape.type === 'path' ? `path` : `${p.shape.type}`;
    return `- Box #${num} = "${p.name}": (Shape: ${shapeDesc}, BBox: ${bboxStr}) -> (Target rect: [${target.x},${target.y},${target.w},${target.h}])`;
  }).join("\n");

  const fullPrompt = `
TASK: separate the original image into parts.

INPUTS:
1. ORIGINAL_IMAGE: The original object with all parts annotated.
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
