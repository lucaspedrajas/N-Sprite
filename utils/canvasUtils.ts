import { GamePart, Rect, AtlasResolution } from "../types";

export type PackingAlgorithm = 'row' | 'grid' | 'maxrects';

const BOX_PADDING = 16;

export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

export const fitImageToSquare = async (
  imageBase64: string,
  size: number = 1024
): Promise<string> => {
  const img = await loadImage(`data:image/png;base64,${imageBase64}`);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  // Fill with white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  // Calculate scale to fit image within square while preserving aspect ratio
  const scale = Math.min(size / img.width, size / img.height);
  const scaledW = img.width * scale;
  const scaledH = img.height * scale;

  // Center the image
  const offsetX = (size - scaledW) / 2;
  const offsetY = (size - scaledH) / 2;

  ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH);

  return canvas.toDataURL("image/png").split(",")[1];
};

interface PartWithSize {
  part: GamePart;
  index: number;
  srcW: number;
  srcH: number;
}

const getPolygonBounds = (polygon: { x: number; y: number }[]): { x: number; y: number; w: number; h: number } => {
  if (polygon.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = polygon[0].x, maxX = polygon[0].x;
  let minY = polygon[0].y, maxY = polygon[0].y;
  for (const pt of polygon) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

const calculatePartSizes = (parts: GamePart[], _imgW: number, _imgH: number): PartWithSize[] => {
  return parts.map((part, index) => {
    const bounds = getPolygonBounds(part.mask.polygon);
    return {
      part: { ...part },
      index,
      srcW: bounds.w,
      srcH: bounds.h,
    };
  });
};

const drawPolygon = (
  ctx: CanvasRenderingContext2D,
  polygon: { x: number; y: number }[]
): void => {
  if (polygon.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(polygon[i].x, polygon[i].y);
  }
  ctx.closePath();
  ctx.stroke();
};

const packRow = (partsWithSize: PartWithSize[], resolution: number): PartWithSize[] => {
  const totalArea = partsWithSize.reduce((sum, p) => sum + p.srcW * p.srcH, 0);
  const availableArea = (resolution - BOX_PADDING * 2) ** 2;
  const scale = Math.sqrt(availableArea / totalArea) * 0.85;

  let curX = BOX_PADDING;
  let curY = BOX_PADDING;
  let rowHeight = 0;

  partsWithSize.forEach((p) => {
    const destW = p.srcW * scale;
    const destH = p.srcH * scale;

    if (curX + destW + BOX_PADDING > resolution) {
      curX = BOX_PADDING;
      curY += rowHeight + BOX_PADDING;
      rowHeight = 0;
    }

    p.part.atlasRect = {
      x: Math.round(curX),
      y: Math.round(curY),
      w: Math.round(destW),
      h: Math.round(destH),
    };

    curX += destW + BOX_PADDING;
    rowHeight = Math.max(rowHeight, destH);
  });

  return partsWithSize;
};

const packGrid = (partsWithSize: PartWithSize[], resolution: number): PartWithSize[] => {
  const n = partsWithSize.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = (resolution - BOX_PADDING * (cols + 1)) / cols;
  const cellH = (resolution - BOX_PADDING * (rows + 1)) / rows;

  partsWithSize.forEach((p, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = BOX_PADDING + col * (cellW + BOX_PADDING);
    const y = BOX_PADDING + row * (cellH + BOX_PADDING);

    const aspectRatio = p.srcW / p.srcH;
    let destW: number, destH: number;
    if (aspectRatio > cellW / cellH) {
      destW = cellW;
      destH = cellW / aspectRatio;
    } else {
      destH = cellH;
      destW = cellH * aspectRatio;
    }

    const offsetX = (cellW - destW) / 2;
    const offsetY = (cellH - destH) / 2;

    p.part.atlasRect = {
      x: Math.round(x + offsetX),
      y: Math.round(y + offsetY),
      w: Math.round(destW),
      h: Math.round(destH),
    };
  });

  return partsWithSize;
};

const packMaxRects = (partsWithSize: PartWithSize[], resolution: number): PartWithSize[] => {
  const totalArea = partsWithSize.reduce((sum, p) => sum + p.srcW * p.srcH, 0);
  const availableArea = (resolution - BOX_PADDING * 2) ** 2;
  const scale = Math.sqrt(availableArea / totalArea) * 0.9;

  const sorted = [...partsWithSize].sort((a, b) => b.srcH * scale - a.srcH * scale);

  interface FreeRect { x: number; y: number; w: number; h: number; }
  const freeRects: FreeRect[] = [{
    x: BOX_PADDING,
    y: BOX_PADDING,
    w: resolution - BOX_PADDING * 2,
    h: resolution - BOX_PADDING * 2,
  }];

  sorted.forEach((p) => {
    const destW = p.srcW * scale;
    const destH = p.srcH * scale;

    let bestIdx = -1;
    let bestScore = Infinity;
    for (let i = 0; i < freeRects.length; i++) {
      const r = freeRects[i];
      if (destW + BOX_PADDING <= r.w && destH + BOX_PADDING <= r.h) {
        const score = r.y + destH;
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
    }

    if (bestIdx >= 0) {
      const r = freeRects[bestIdx];
      p.part.atlasRect = {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(destW),
        h: Math.round(destH),
      };

      freeRects.splice(bestIdx, 1);
      const rightW = r.w - destW - BOX_PADDING;
      const bottomH = r.h - destH - BOX_PADDING;
      if (rightW > 20) {
        freeRects.push({ x: r.x + destW + BOX_PADDING, y: r.y, w: rightW, h: destH });
      }
      if (bottomH > 20) {
        freeRects.push({ x: r.x, y: r.y + destH + BOX_PADDING, w: r.w, h: bottomH });
      }
    } else {
      p.part.atlasRect = { x: BOX_PADDING, y: BOX_PADDING, w: Math.round(destW), h: Math.round(destH) };
    }
  });

  return partsWithSize;
};

const drawAtlas = (
  ctx: CanvasRenderingContext2D,
  partsWithSize: PartWithSize[],
  resolution: number
): void => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, resolution, resolution);

  partsWithSize.forEach((p) => {
    const rect = p.part.atlasRect!;
    const polygon = p.part.mask.polygon;
    const bounds = getPolygonBounds(polygon);
    const num = p.index + 1;

    // Scale polygon to fit atlas rect
    const scaleX = rect.w / bounds.w;
    const scaleY = rect.h / bounds.h;
    const scaledPolygon = polygon.map(pt => ({
      x: rect.x + (pt.x - bounds.x) * scaleX,
      y: rect.y + (pt.y - bounds.y) * scaleY,
    }));

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    drawPolygon(ctx, scaledPolygon);
    ctx.setLineDash([]);

    const fontSize = Math.min(rect.w, rect.h) * 0.6;
    ctx.fillStyle = "#000000";
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${num}`, rect.x + rect.w / 2, rect.y + rect.h / 2);
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
};

const drawAnnotatedOriginal = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  parts: GamePart[]
): void => {
  ctx.drawImage(img, 0, 0);
  const w = img.width;
  const h = img.height;

  parts.forEach((part, index) => {
    const num = index + 1;
    const polygon = part.mask.polygon;
    const bounds = getPolygonBounds(polygon);
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;

    ctx.strokeStyle = "#ff0000ff";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    drawPolygon(ctx, polygon);
    ctx.setLineDash([]);

    const fontSize = Math.min(bounds.w, bounds.h) * 0.4;
    ctx.fillStyle = "#00FF00";
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = fontSize * 0.1;
    ctx.strokeText(`${num}`, cx, cy);
    ctx.fillText(`${num}`, cx, cy);
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
};

export const createAtlasPreparation = async (
  originalImageBase64: string,
  parts: GamePart[],
  resolution: AtlasResolution,
  algorithm: PackingAlgorithm = 'row'
): Promise<{ processedImage: string; annotatedOriginal: string; partsWithAtlasCoords: GamePart[] }> => {
  const img = await loadImage(`data:image/png;base64,${originalImageBase64}`);
  const w = img.width;
  const h = img.height;

  // Create annotated original image with bounding boxes and numbers
  const origCanvas = document.createElement("canvas");
  origCanvas.width = w;
  origCanvas.height = h;
  const origCtx = origCanvas.getContext("2d");
  if (!origCtx) throw new Error("Canvas 2D context not available");
  drawAnnotatedOriginal(origCtx, img, parts);
  const annotatedOriginal = origCanvas.toDataURL("image/png").split(",")[1];

  // Create atlas layout
  const canvas = document.createElement("canvas");
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  let partsWithSize = calculatePartSizes(parts, w, h);

  switch (algorithm) {
    case 'grid':
      partsWithSize = packGrid(partsWithSize, resolution);
      break;
    case 'maxrects':
      partsWithSize = packMaxRects(partsWithSize, resolution);
      break;
    case 'row':
    default:
      partsWithSize = packRow(partsWithSize, resolution);
      break;
  }

  drawAtlas(ctx, partsWithSize, resolution);

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];

  const newParts = partsWithSize.map((p) => p.part);
  return { processedImage: base64, annotatedOriginal, partsWithAtlasCoords: newParts };
};

export const removeBackgroundColor = async (
  imageBase64: string,
  bgColor: { r: number; g: number; b: number } = { r: 255, g: 255, b: 255 },
  tolerance: number = 30
): Promise<string> => {
  const img = await loadImage(`data:image/png;base64,${imageBase64}`);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const diffR = Math.abs(r - bgColor.r);
    const diffG = Math.abs(g - bgColor.g);
    const diffB = Math.abs(b - bgColor.b);

    if (diffR <= tolerance && diffG <= tolerance && diffB <= tolerance) {
      data[i + 3] = 0; // Set alpha to 0 (transparent)
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png").split(",")[1];
};