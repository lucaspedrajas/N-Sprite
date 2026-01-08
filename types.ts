export interface Point {
  x: number;
  y: number;
}

export interface PartMask {
  polygon: Point[];  // Array of vertices defining the mask polygon (clockwise)
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export enum MovementType {
  ROTATION = 'ROTATION',
  TRANSLATION_HORIZONTAL = 'TRANSLATION_HORIZONTAL',
  TRANSLATION_VERTICAL = 'TRANSLATION_VERTICAL',
  STATIC = 'STATIC',
  SCALE_PULSE = 'SCALE_PULSE'
}

export type AtlasResolution = 1024 | 2048;

export interface GamePart {
  id: string;
  name: string;
  parentId: string | null;
  mask: PartMask;
  pivot: { x: number; y: number };
  movementType: MovementType;
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
  [MovementType.TRANSLATION_HORIZONTAL]: 'Move Horizontally',
  [MovementType.TRANSLATION_VERTICAL]: 'Move Vertically',
  [MovementType.STATIC]: 'Static',
  [MovementType.SCALE_PULSE]: 'Pulse Scale'
};