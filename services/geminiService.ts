
// Multi-Agent Architecture for Kinematic Decomposition
import { GoogleGenAI, Type } from "@google/genai";
import {
  GamePart,
  PartManifest,
  WorkerGeometry,
  SVGPrimitive,
  MovementType,
  PartTypeHint,
  APICallLog,
  PipelineDebugData,
  PipelineStage,
  WorkerError
} from '../types';

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY not found in environment");
  return new GoogleGenAI({ apiKey });
};

export type StreamCallback = (chunk: string, done: boolean) => void;
export type StageCallback = (stage: string, message: string) => void;
export type DebugCallback = (data: PipelineDebugData) => void;
export type RetryWorkerCallback = (manifestId: string) => Promise<WorkerGeometry | null>;

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
  apiLogs: []
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

// ============================================
// Stage 1: Director - Discovery & Grounding
// ============================================

const runDirector = async (
  imageBase64: string,
  onStream?: StreamCallback,
  onDebug?: DebugCallback
): Promise<PartManifest[]> => {
  const ai = getAiClient();
  const modelId = "gemini-3-flash-preview";
  const startTime = Date.now();

  const prompt = `
Role: You are a Senior 2D Rigger specializing in kinematic mechanics.
Task: Identify the main "Rigid Bodies" (kinematic groups) in this game asset.

IMPORTANT: Use RELATIVE coordinates (0.0 to 1.0) where 0.0 is top/left and 1.0 is bottom/right.

Definition of a "Part":
A part is a group of visual elements that moves as a single rigid unit.
- If multiple objects move together (e.g., a rider and their saddle, or a wheel and its hubcap), they must be ONE part.
- Ignore internal seams, bolts, or color changes unless they represent a mechanical joint.

For each Rigid Body, provide:
1. id: Unique snake_case identifier (e.g., "rear_wheel_assembly", "main_chassis")
2. name: Human-readable display name
3. visual_anchor: [x, y] - A point (0-1 relative) that falls INSIDE this specific part.
4. type_hint: One of [WHEEL, LIMB, BODY, PISTON, JOINT, DECORATION, OTHER]

Rules:
- Prioritize minimal, functional parts over detailed separation.
- Ensure visual_anchor is clearly inside the main mass of the part.
- Group static attachments (stickers, armor plates, handles) into their parent body.
`;

  const responseSchema = {
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
        type_hint: {
          type: Type.STRING,
          enum: ["WHEEL", "LIMB", "BODY", "PISTON", "JOINT", "DECORATION", "OTHER"]
        }
      },
      required: ["id", "name", "visual_anchor", "type_hint"]
    }
  };

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
      responseSchema
    }
  });

  let fullText = "";
  for await (const chunk of stream) {
    if (chunk.text) {
      fullText += chunk.text;
      onStream?.(fullText, false);
    }
  }
  onStream?.(fullText, true);

  if (!fullText) throw new Error("Director: No response");

  addApiLog('director', prompt, fullText, Date.now() - startTime);
  const result = JSON.parse(fullText) as PartManifest[];
  debugData.directorOutput = result;
  onDebug?.({ ...debugData });

  return result;
};

// ============================================
// Stage 2: Worker - Geometry Extraction (per part)
// ============================================

const runWorker = async (
  imageBase64: string,
  manifest: PartManifest,
  onDebug?: DebugCallback
): Promise<WorkerGeometry> => {
  const ai = getAiClient();
  const modelId = "gemini-3-flash-preview";
  const startTime = Date.now();

  const prompt = `
Role: You are a Geometry Worker reconstructing a single part.
Focus Area: The part "${manifest.name}" (id: ${manifest.id}) located near relative coordinates [${manifest.visual_anchor.join(', ')}].
Part Type: ${manifest.type_hint}

IMPORTANT: All coordinates must be RELATIVE (0.0 to 1.0).

Task:
1. IGNORE occluding objects - imagine this part is isolated
2. Fit an SVG primitive to this part's shape:
   - circle: { type: "circle", cx, cy, r }
   - rect: { type: "rect", x, y, width, height, rx? }
   - ellipse: { type: "ellipse", cx, cy, rx, ry }
   - path: { type: "path", d: "..." } - for complex shapes, use SVG path commands
3. Provide the bounding box [min_x, min_y, max_x, max_y] (0-1 relative)
4. Set amodal_completed: true if you reconstructed hidden/occluded parts
5. Confidence score 0-1

Prefer simple primitives (circle, rect, ellipse) when they fit well.
Use path only for irregular shapes.
`;

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

  const responseSchema = {
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

  const response = await ai.models.generateContent({
    model: modelId,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/png", data: imageBase64 } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema
    }
  });

  const text = response.text;
  if (!text) throw new Error(`Worker ${manifest.id}: No response`);

  addApiLog('workers', prompt, text, Date.now() - startTime);
  const result = JSON.parse(text);
  // Normalize shape to proper SVGPrimitive type
  const geometry: WorkerGeometry = {
    id: manifest.id,
    shape: normalizeShape(result.shape),
    bbox: result.bbox,
    amodal_completed: result.amodal_completed,
    confidence: result.confidence
  };

  debugData.workerOutputs.push(geometry);
  onDebug?.({ ...debugData });

  return geometry;
};

// Normalize raw shape response to proper SVGPrimitive
const normalizeShape = (raw: any): SVGPrimitive => {
  switch (raw.type) {
    case 'circle':
      return { type: 'circle', cx: raw.cx, cy: raw.cy, r: raw.r };
    case 'rect':
      return { type: 'rect', x: raw.x, y: raw.y, width: raw.width, height: raw.height, rx: raw.rx };
    case 'ellipse':
      return { type: 'ellipse', cx: raw.cx, cy: raw.cy, rx: raw.rx, ry: raw.ry };
    case 'path':
      return { type: 'path', d: raw.d };
    default:
      // Fallback to rect from bbox if type unknown
      return { type: 'rect', x: 0, y: 0, width: 1, height: 1 };
  }
};

// ============================================
// Stage 3: Architect - Hierarchy & Rigging
// ============================================

const runArchitect = async (
  imageBase64: string,
  manifests: PartManifest[],
  geometries: WorkerGeometry[],
  onStream?: StreamCallback,
  onDebug?: DebugCallback
): Promise<GamePart[]> => {
  const ai = getAiClient();
  const modelId = "gemini-3-flash-preview";
  const startTime = Date.now();

  // Build geometry summary for architect
  const geoSummary = geometries.map(g => {
    const m = manifests.find(m => m.id === g.id)!;
    return `- ${m.name} (${g.id}): type=${g.shape.type}, bbox=[${g.bbox.join(',')}], type_hint=${m.type_hint}`;
  }).join('\n');

  const prompt = `
Role: You are the Rigging Architect - the lead engineer assembling the final rig.

Parts with their extracted geometry (all coordinates are 0-1 relative):
${geoSummary}

Task:
1. BUILD HIERARCHY: Assign parentId to each part
   - Larger body parts are typically parents of smaller attached parts
   - Use null for root parts (main body, chassis)
   - Logic: Parts attach to overlapping or adjacent larger parts

2. DEFINE PIVOTS: Assign pivot {x, y} (0-1 relative) for each part
   - Wheels/circles: pivot at geometric center
   - Limbs: pivot at joint/attachment point
   - Look for bolts, joints, or connection points

3. ASSIGN MOVEMENT: One of [ROTATION, SLIDING, FIXED, ELASTIC]
   - ROTATION: Wheels, arms, rotating joints
   - SLIDING: Pistons, sliding mechanisms
   - FIXED: Decorations, static parts
   - ELASTIC: Flexible/deformable parts

Output the complete GamePart array with all fields.
`;

  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        name: { type: Type.STRING },
        parentId: { type: Type.STRING, nullable: true },
        pivot: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER }
          },
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
      responseSchema
    }
  });

  let fullText = "";
  for await (const chunk of stream) {
    if (chunk.text) {
      fullText += chunk.text;
      onStream?.(fullText, false);
    }
  }
  onStream?.(fullText, true);

  if (!fullText) throw new Error("Architect: No response");

  const rigging = JSON.parse(fullText) as Array<{
    id: string;
    name: string;
    parentId: string | null;
    pivot: { x: number; y: number };
    movementType: string;
  }>;

  addApiLog('architect', prompt, fullText, Date.now() - startTime);

  // Merge geometry with rigging to create final GameParts
  const parts = rigging.map(rig => {
    const geo = geometries.find(g => g.id === rig.id);
    const manifest = manifests.find(m => m.id === rig.id);

    if (!geo || !manifest) {
      throw new Error(`Missing data for part ${rig.id}`);
    }

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

// Run only the Director stage - returns full debug data
export const runDirectorOnly = async (
  imageBase64: string,
  onStream?: StreamCallback,
  onStage?: StageCallback,
  onDebug?: DebugCallback
): Promise<PipelineDebugData> => {
  // Reset debug data for new run
  debugData = {
    directorOutput: null,
    workerOutputs: [],
    workerErrors: [],
    architectOutput: null,
    apiLogs: []
  };

  onStage?.('director', 'Discovering parts...');
  const manifests = await runDirector(imageBase64, onStream, onDebug);

  debugData.directorOutput = manifests;
  onDebug?.({ ...debugData });

  return { ...debugData };
};

// Run only the Workers stage - requires manifests
export const runWorkersOnly = async (
  imageBase64: string,
  manifests: PartManifest[],
  onStream?: StreamCallback,
  onStage?: StageCallback,
  onDebug?: DebugCallback,
  existingDebugData?: PipelineDebugData
): Promise<PipelineDebugData> => {
  // Restore context if provided
  if (existingDebugData) {
    debugData = { ...existingDebugData, directorOutput: manifests };
  } else {
    debugData.directorOutput = manifests;
  }

  if (!debugData.directorOutput || debugData.directorOutput.length === 0) {
    throw new Error('No director output found.');
  }

  // Clear previous worker data
  debugData.workerOutputs = [];
  debugData.workerErrors = [];
  onDebug?.({ ...debugData }); // Notify UI that we are starting from scratch (triggers skeletons)

  const BATCH_SIZE = 8;
  const workerResults: PromiseSettledResult<WorkerGeometry>[] = [];

  for (let i = 0; i < manifests.length; i += BATCH_SIZE) {
    const chunk = manifests.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(manifests.length / BATCH_SIZE);

    onStage?.('workers', `Processing batch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + chunk.length, manifests.length)} of ${manifests.length})...`);

    const batchResults = await Promise.allSettled(
      chunk.map(m => runWorker(imageBase64, m, onDebug))
    );

    workerResults.push(...batchResults);
  }

  const geometries: WorkerGeometry[] = [];
  const errors: WorkerError[] = [];

  workerResults.forEach((result, index) => {
    const manifest = manifests[index];
    if (result.status === 'fulfilled') {
      geometries.push(result.value);
    } else {
      const errorMsg = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      errors.push({
        manifestId: manifest.id,
        manifestName: manifest.name,
        error: errorMsg,
        retryCount: 0
      });
    }
  });

  debugData.workerErrors = errors;
  // workerOutputs are already pushed implicitly by runWorker, but let's ensure consistency
  // runWorker pushes to global debugData.workerOutputs. 
  // We should rely on that or reset it. 
  // Ideally runWorker shouldn't touch global state if we are being pure, but for now we sync.

  onDebug?.({ ...debugData });

  return { ...debugData };
};

// Run only the Architect stage - requires manifests and geometries
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
  // Clear previous architect output to ensure we show loading state
  debugData.architectOutput = null;
  onDebug?.({ ...debugData });

  const manifests = debugData.directorOutput;
  const geometries = workerOutputs;

  if (!manifests || manifests.length === 0) {
    throw new Error('No director output found. Run Director first.');
  }
  if (!geometries || geometries.length === 0) {
    throw new Error('No worker outputs found. Run Workers first.');
  }

  onStage?.('architect', 'Building hierarchy and rigging...');
  const parts = await runArchitect(imageBase64, manifests, geometries, onStream, onDebug);

  debugData.architectOutput = parts;
  onDebug?.({ ...debugData });

  return { ...debugData };
};



// Retry a single failed worker
export const retryWorker = async (
  imageBase64: string,
  manifestId: string,
  onDebug?: DebugCallback
): Promise<WorkerGeometry | null> => {
  // Find the manifest in debug data
  const manifest = debugData.directorOutput?.find(m => m.id === manifestId);
  if (!manifest) {
    console.error(`Manifest ${manifestId} not found`);
    return null;
  }

  try {
    const geometry = await runWorker(imageBase64, manifest, onDebug);

    // Update debug data - remove from errors, add to outputs
    debugData.workerErrors = debugData.workerErrors.filter(e => e.manifestId !== manifestId);

    // Check if already exists (shouldn't, but be safe)
    const existingIdx = debugData.workerOutputs.findIndex(w => w.id === manifestId);
    if (existingIdx >= 0) {
      debugData.workerOutputs[existingIdx] = geometry;
    } else {
      debugData.workerOutputs.push(geometry);
    }

    onDebug?.({ ...debugData });
    return geometry;
  } catch (error) {
    // Update retry count in errors
    const errorEntry = debugData.workerErrors.find(e => e.manifestId === manifestId);
    if (errorEntry) {
      errorEntry.retryCount++;
      errorEntry.error = error instanceof Error ? error.message : String(error);
    }
    onDebug?.({ ...debugData });
    return null;
  }
};

// Get current debug data (for UI access)
export const getDebugData = (): PipelineDebugData => ({ ...debugData });

// Retry Director with optional conversational context
export const retryDirector = async (
  imageBase64: string,
  options: RetryOptions,
  onStream?: StreamCallback,
  onDebug?: DebugCallback
): Promise<PartManifest[]> => {
  const ai = getAiClient();
  const modelId = "gemini-3-flash-preview";
  const startTime = Date.now();

  let prompt: string;

  if (options.mode === 'conversational' && options.previousResult) {
    prompt = `
Role: You are a Senior 2D Rigger specializing in efficient game optimization.
Task: Refine the breakdown of this asset into "Rigid Bodies" for cutout animation.

Your previous analysis:
${options.previousResult}

${options.userFeedback ? `User feedback: "${options.userFeedback}"` : 'The previous breakdown had too many unnecessary pieces.'}

CRITICAL INSTRUCTION: MERGE parts that move together.
- If Part A is bolted, welded, or stuck to Part B and cannot rotate/move independently, they are ONE single part.
- Do not separate hubcaps from wheels.
- Do not separate decorations from the chassis/body.
- Do not separate screws, bolts, or highlights.

Provide an UPDATED list. For each merged kinematic part:
1. id: Unique snake_case identifier
2. name: Human-readable display name
3. visual_anchor: [x, y] - A point (0-1 relative) INSIDE this part
4. type_hint: One of [WHEEL, LIMB, BODY, PISTON, JOINT, DECORATION, OTHER]
`;
  } else {
    prompt = `
Role: You are a Senior 2D Rigger specializing in kinematic mechanics.
Task: Identify the main "Rigid Bodies" (kinematic groups) in this game asset.

IMPORTANT: Use RELATIVE coordinates (0.0 to 1.0) where 0.0 is top/left and 1.0 is bottom/right.

Definition of a "Part":
A part is a group of visual elements that moves as a single rigid unit.
- If multiple objects move together (e.g., a rider and their saddle, or a wheel and its hubcap), they must be ONE part.
- Ignore internal seams, bolts, or color changes unless they represent a mechanical joint.

For each Rigid Body, provide:
1. id: Unique snake_case identifier (e.g., "rear_wheel_assembly", "main_chassis")
2. name: Human-readable display name
3. visual_anchor: [x, y] - A point (0-1 relative) that falls INSIDE this specific part.
4. type_hint: One of [WHEEL, LIMB, BODY, PISTON, JOINT, DECORATION, OTHER]

Rules:
- Prioritize minimal, functional parts over detailed separation.
- Ensure visual_anchor is clearly inside the main mass of the part.
- Group static attachments (stickers, armor plates, handles) into their parent body.
`;

  }

  const responseSchema = {
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
        type_hint: {
          type: Type.STRING,
          enum: ["WHEEL", "LIMB", "BODY", "PISTON", "JOINT", "DECORATION", "OTHER"]
        }
      },
      required: ["id", "name", "visual_anchor", "type_hint"]
    }
  };

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
      responseSchema
    }
  });

  let fullText = "";
  for await (const chunk of stream) {
    if (chunk.text) {
      fullText += chunk.text;
      onStream?.(fullText, false);
    }
  }
  onStream?.(fullText, true);

  if (!fullText) throw new Error("Director retry: No response");

  addApiLog('director', prompt, fullText, Date.now() - startTime);
  const result = JSON.parse(fullText) as PartManifest[];

  // Update debug data
  debugData.directorOutput = result;
  debugData.workerOutputs = []; // Clear workers since manifests changed
  debugData.workerErrors = [];
  debugData.architectOutput = null;
  onDebug?.({ ...debugData });

  return result;
};

// Retry Architect with optional conversational context
export const retryArchitect = async (
  imageBase64: string,
  options: RetryOptions,
  onStream?: StreamCallback,
  onDebug?: DebugCallback
): Promise<GamePart[]> => {
  const manifests = debugData.directorOutput;
  const geometries = debugData.workerOutputs;

  if (!manifests || geometries.length === 0) {
    throw new Error("Cannot retry Architect: missing Director or Worker data");
  }

  const ai = getAiClient();
  const modelId = "gemini-3-flash-preview";
  const startTime = Date.now();

  const geoSummary = geometries.map(g => {
    const m = manifests.find(m => m.id === g.id)!;
    return `- ${m.name} (${g.id}): type=${g.shape.type}, bbox=[${g.bbox.join(',')}], type_hint=${m.type_hint}`;
  }).join('\n');

  let prompt: string;

  if (options.mode === 'conversational' && options.previousResult) {
    prompt = `
Role: You are the Rigging Architect - the lead engineer assembling the final rig.

Parts with their extracted geometry (all coordinates are 0-1 relative):
${geoSummary}

Your previous rigging:
${options.previousResult}

${options.userFeedback ? `User feedback: "${options.userFeedback}"` : 'Please re-analyze the hierarchy and rigging.'}

Provide an UPDATED rigging addressing the feedback:
1. BUILD HIERARCHY: Assign parentId (null for roots)
2. DEFINE PIVOTS: {x, y} (0-1 relative) at joints/centers
3. ASSIGN MOVEMENT: [ROTATION, SLIDING, FIXED, ELASTIC]
`;
  } else {
    prompt = `
Role: You are the Rigging Architect - the lead engineer assembling the final rig.

Parts with their extracted geometry (all coordinates are 0-1 relative):
${geoSummary}

Task:
1. BUILD HIERARCHY: Assign parentId to each part
   - Larger body parts are typically parents of smaller attached parts
   - Use null for root parts (main body, chassis)

2. DEFINE PIVOTS: Assign pivot {x, y} (0-1 relative) for each part
   - Wheels/circles: pivot at geometric center
   - Limbs: pivot at joint/attachment point

3. ASSIGN MOVEMENT: One of [ROTATION, SLIDING, FIXED, ELASTIC]
`;
  }

  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        name: { type: Type.STRING },
        parentId: { type: Type.STRING, nullable: true },
        pivot: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER }
          },
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
      responseSchema
    }
  });

  let fullText = "";
  for await (const chunk of stream) {
    if (chunk.text) {
      fullText += chunk.text;
      onStream?.(fullText, false);
    }
  }
  onStream?.(fullText, true);

  if (!fullText) throw new Error("Architect retry: No response");

  const rigging = JSON.parse(fullText) as Array<{
    id: string;
    name: string;
    parentId: string | null;
    pivot: { x: number; y: number };
    movementType: string;
  }>;

  addApiLog('architect', prompt, fullText, Date.now() - startTime);

  // Merge geometry with rigging
  const parts = rigging.map(rig => {
    const geo = geometries.find(g => g.id === rig.id);
    const manifest = manifests.find(m => m.id === rig.id);

    if (!geo || !manifest) {
      throw new Error(`Missing data for part ${rig.id}`);
    }

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

// Retry a worker with conversational context
export const retryWorkerWithFeedback = async (
  imageBase64: string,
  manifestId: string,
  options: RetryOptions,
  onDebug?: DebugCallback
): Promise<WorkerGeometry | null> => {
  const manifest = debugData.directorOutput?.find(m => m.id === manifestId);
  if (!manifest) {
    console.error(`Manifest ${manifestId} not found`);
    return null;
  }

  const ai = getAiClient();
  const modelId = "gemini-3-flash-preview";
  const startTime = Date.now();

  // Find previous result if in conversational mode
  const previousGeo = debugData.workerOutputs.find(w => w.id === manifestId);

  let prompt: string;

  if (options.mode === 'conversational' && previousGeo) {
    const hasCompositedImage = !!options.compositedImage;
    prompt = `
Role: You are a Geometry Worker reconstructing a single part.

Target part: "${manifest.name}" (${manifest.id})
Type hint: ${manifest.type_hint}
Visual anchor (0-1 relative): [${manifest.visual_anchor.join(', ')}]

Your previous extraction:
- Shape type: ${previousGeo.shape.type}
- Bbox: [${previousGeo.bbox.join(', ')}]
${previousGeo.shape.type === 'path' ? `- Path: ${(previousGeo.shape as any).d}` : ''}

${hasCompositedImage ? 'The SECOND image shows your previous shape (colored outline) overlaid on the original. Analyze if the shape follows the part contour correctly.' : ''}

${options.userFeedback ? `User feedback: "${options.userFeedback}"` : 'Please re-analyze and improve the shape to better match the part contour.'}

Provide an UPDATED geometry. Output format (0-1 relative coords):
1. shape: SVG primitive (circle, rect, ellipse, or path)
2. bbox: [min_x, min_y, max_x, max_y]
3. amodal_completed: description of occluded parts
4. confidence: 0-1
`;
  } else {
    prompt = `
Role: You are a Geometry Worker reconstructing a single part.

Target part: "${manifest.name}" (${manifest.id})
Type hint: ${manifest.type_hint}
Visual anchor (0-1 relative): [${manifest.visual_anchor.join(', ')}]

Task: Extract precise geometry for this part ONLY.

Output format (all coordinates 0-1 relative):
1. shape: SVG primitive - choose the best fit:
   - circle: {type: "circle", cx, cy, r}
   - rect: {type: "rect", x, y, width, height, rx?}
   - ellipse: {type: "ellipse", cx, cy, rx, ry}
   - path: {type: "path", d: "M...Z"} for complex shapes

2. bbox: [min_x, min_y, max_x, max_y] tight bounding box

3. amodal_completed: Describe any occluded/hidden portions

4. confidence: 0.0-1.0
`;
  }

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      shape: {
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
      },
      bbox: { type: Type.ARRAY, items: { type: Type.NUMBER } },
      amodal_completed: { type: Type.STRING },
      confidence: { type: Type.NUMBER }
    },
    required: ["shape", "bbox", "confidence"]
  };

  try {
    // Build parts array - include composited image if available for visual feedback
    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [
      { inlineData: { mimeType: "image/png", data: imageBase64 } }
    ];

    // Add composited image (with shape overlay) for conversational mode
    if (options.mode === 'conversational' && options.compositedImage) {
      parts.push({ inlineData: { mimeType: "image/png", data: options.compositedImage } });
    }

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema
      }
    });

    const text = response.text;
    if (!text) throw new Error(`Worker ${manifest.id}: No response`);

    addApiLog('workers', prompt, text, Date.now() - startTime);
    const result = JSON.parse(text);

    const geometry: WorkerGeometry = {
      id: manifest.id,
      shape: normalizeShape(result.shape),
      bbox: result.bbox,
      amodal_completed: result.amodal_completed,
      confidence: result.confidence
    };

    // Update debug data - remove from errors, update/add to outputs
    debugData.workerErrors = debugData.workerErrors.filter(e => e.manifestId !== manifestId);
    const existingIdx = debugData.workerOutputs.findIndex(w => w.id === manifestId);
    if (existingIdx >= 0) {
      debugData.workerOutputs[existingIdx] = geometry;
    } else {
      debugData.workerOutputs.push(geometry);
    }

    onDebug?.({ ...debugData });
    return geometry;
  } catch (error) {
    const errorEntry = debugData.workerErrors.find(e => e.manifestId === manifestId);
    if (errorEntry) {
      errorEntry.retryCount++;
      errorEntry.error = error instanceof Error ? error.message : String(error);
    } else {
      debugData.workerErrors.push({
        manifestId,
        manifestName: manifest.name,
        error: error instanceof Error ? error.message : String(error),
        retryCount: 1
      });
    }
    onDebug?.({ ...debugData });
    return null;
  }
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
    const bboxStr = `[${p.bbox.map(v => v.toFixed(3)).join(',')}]`;
    const shapeDesc = p.shape.type === 'path'
      ? `path`
      : `${p.shape.type}`;
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
