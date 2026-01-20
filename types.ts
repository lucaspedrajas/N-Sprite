// ============================================
// Base Types (Pixel-based for rendering)
// ============================================

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Bounding box as [min_x, min_y, max_x, max_y] - can be relative (0-1) or pixel
export type BBox = [number, number, number, number];

export type AtlasResolution = 1024 | 2048;

// ============================================
// SVG Primitive Types (All coordinates are RELATIVE 0-1)
// ============================================

export interface SVGCircle {
  type: 'circle';
  cx: number;  // 0-1 relative
  cy: number;  // 0-1 relative
  r: number;   // 0-1 relative to image width
}

export interface SVGRect {
  type: 'rect';
  x: number;      // 0-1 relative
  y: number;      // 0-1 relative
  width: number;  // 0-1 relative
  height: number; // 0-1 relative
  rx?: number;    // corner radius, 0-1 relative
}

export interface SVGEllipse {
  type: 'ellipse';
  cx: number;  // 0-1 relative
  cy: number;  // 0-1 relative
  rx: number;  // 0-1 relative
  ry: number;  // 0-1 relative
}

export interface SVGPath {
  type: 'path';
  d: string;  // SVG path data with relative coords (0-1 scaled)
}

export type SVGPrimitive = SVGCircle | SVGRect | SVGEllipse | SVGPath;

// ============================================
// Multi-Agent Architecture Types
// ============================================

// Stage 1: Director output - Part discovery & grounding
export type PartTypeHint = 'WHEEL' | 'LIMB' | 'BODY' | 'PISTON' | 'JOINT' | 'DECORATION' | 'OTHER';

export interface PartManifest {
  id: string;
  name: string;
  visual_anchor: [number, number];  // [x, y] relative 0-1, point inside the part
  type_hint: PartTypeHint;
}

// Stage 2: Worker output - Geometry per part
export interface WorkerGeometry {
  id: string;
  shape: SVGPrimitive;
  bbox: BBox;  // Relative 0-1
  amodal_completed: boolean;  // True if occlusion was resolved
  confidence: number;  // 0-1
}

// Stage 3: Architect output - Final rigged part
export enum MovementType {
  ROTATION = 'ROTATION',
  SLIDING = 'SLIDING',
  FIXED = 'FIXED',
  ELASTIC = 'ELASTIC'
}

export interface GamePart {
  id: string;
  name: string;
  parentId: string | null;
  shape: SVGPrimitive;  // The geometric primitive
  bbox: BBox;           // Relative 0-1 bounding box
  pivot: { x: number; y: number };  // Relative 0-1
  movementType: MovementType;
  type_hint: PartTypeHint;
  confidence: number;
  atlasRect?: Rect;  // Pixel-based, set during atlas packing
}

// Pipeline stage tracking
export type PipelineStage = 'idle' | 'director' | 'workers' | 'architect' | 'complete';

// API Call Log Entry
export interface APICallLog {
  id: string;
  stage: PipelineStage;
  timestamp: number;
  input: {
    prompt: string;
    hasImage: boolean;
  };
  output: string;
  duration: number;
}

// Worker error info for failed workers
export interface WorkerError {
  manifestId: string;
  manifestName: string;
  error: string;
  retryCount: number;
}

// Pipeline Debug Data - intermediate results from each stage
export interface PipelineDebugData {
  directorOutput: PartManifest[] | null;
  workerOutputs: WorkerGeometry[];
  workerErrors: WorkerError[];
  architectOutput: GamePart[] | null;
  apiLogs: APICallLog[];
}

export interface AppState {
  originalImage: string | null;
  originalImageDimensions: { width: number; height: number } | null;
  analysisResults: GamePart[] | null;
  annotatedOriginalImage: string | null;
  preparedAtlasImage: string | null;
  generatedAtlasImage: string | null;
  isAnalyzing: boolean;
  isPreparing: boolean;
  isGenerating: boolean;
  resolution: AtlasResolution;
  error: string | null;
  activeStep: number;
}

export interface StreamState {
  thinkingText: string;
  isStreaming: boolean;
  currentStage: string;
  stageMessage: string;
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  [MovementType.ROTATION]: 'Rotate',
  [MovementType.SLIDING]: 'Slide',
  [MovementType.FIXED]: 'Fixed',
  [MovementType.ELASTIC]: 'Elastic'
};

export const TYPE_HINT_LABELS: Record<PartTypeHint, string> = {
  WHEEL: 'Wheel',
  LIMB: 'Limb',
  BODY: 'Body',
  PISTON: 'Piston',
  JOINT: 'Joint',
  DECORATION: 'Decoration',
  OTHER: 'Other'
};

// ============================================
// Coordinate Conversion Helpers
// ============================================

// Convert relative bbox (0-1) to pixel Rect
export const bboxToRect = (bbox: BBox, size: number = 1): Rect => ({
  x: bbox[0] * size,
  y: bbox[1] * size,
  w: (bbox[2] - bbox[0]) * size,
  h: (bbox[3] - bbox[1]) * size
});

// Convert relative coord to pixel
export const relToPixel = (rel: number, size: number): number => Math.round(rel * size);

// Convert pixel coord to relative
export const pixelToRel = (px: number, size: number): number => px / size;

// Convert SVG primitive from relative to pixel coordinates
export const primitiveToPixel = (shape: SVGPrimitive, size: number): SVGPrimitive => {
  switch (shape.type) {
    case 'circle':
      return {
        type: 'circle',
        cx: relToPixel(shape.cx, size),
        cy: relToPixel(shape.cy, size),
        r: relToPixel(shape.r, size)
      };
    case 'rect':
      return {
        type: 'rect',
        x: relToPixel(shape.x, size),
        y: relToPixel(shape.y, size),
        width: relToPixel(shape.width, size),
        height: relToPixel(shape.height, size),
        rx: shape.rx ? relToPixel(shape.rx, size) : undefined
      };
    case 'ellipse':
      return {
        type: 'ellipse',
        cx: relToPixel(shape.cx, size),
        cy: relToPixel(shape.cy, size),
        rx: relToPixel(shape.rx, size),
        ry: relToPixel(shape.ry, size)
      };
    case 'path':
      // Path coordinates need to be scaled in the d attribute
      // This is handled separately during rendering
      return shape;
  }
};

// Generate SVG element string from primitive
export const primitiveToSVG = (shape: SVGPrimitive): string => {
  switch (shape.type) {
    case 'circle':
      return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" />`;
    case 'rect':
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}"${shape.rx ? ` rx="${shape.rx}"` : ''} />`;
    case 'ellipse':
      return `<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}" />`;
    case 'path':
      return `<path d="${shape.d}" />`;
  }
};