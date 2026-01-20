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

// Bounding box as [min_x, min_y, max_x, max_y]
export type BBox = [number, number, number, number];

export enum MovementType {
  ROTATION = 'ROTATION',
  TRANSLATION_AXIS = 'TRANSLATION_AXIS',
  STATIC = 'STATIC',
  ELASTIC = 'ELASTIC'
}

export type AtlasResolution = 1024 | 2048;

export interface GamePart {
  id: string;
  name: string;
  parentId: string | null;
  bbox: BBox;  // [min_x, min_y, max_x, max_y]
  mask_type: 'SVG_PATH';
  mask_path: string;  // SVG path d attribute
  pivot: { x: number; y: number };
  movementType: MovementType;
  confidence?: number;  // 0-1 confidence score
  atlasRect?: Rect; 
}

export interface AppState {
  originalImage: string | null;
  originalImageDimensions: { w: number; h: number } | null;
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

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  [MovementType.ROTATION]: 'Rotate',
  [MovementType.TRANSLATION_AXIS]: 'Translate',
  [MovementType.STATIC]: 'Static',
  [MovementType.ELASTIC]: 'Elastic'
};

// Helper to convert bbox to Rect
export const bboxToRect = (bbox: BBox): Rect => ({
  x: bbox[0],
  y: bbox[1],
  w: bbox[2] - bbox[0],
  h: bbox[3] - bbox[1]
});