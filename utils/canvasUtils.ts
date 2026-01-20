import { GamePart, Rect, AtlasResolution, bboxToRect, SVGPrimitive, relToPixel } from "../types";

export type PackingAlgorithm = 'row' | 'grid' | 'maxrects';

const BOX_PADDING = 16;

// Clamp relative value to 0-1 range to prevent shapes exceeding canvas
const clampRel = (v: number): number => Math.max(0, Math.min(1, v));

// Clamp bbox values
const clampBbox = (bbox: [number, number, number, number]): [number, number, number, number] => {
  return [clampRel(bbox[0]), clampRel(bbox[1]), clampRel(bbox[2]), clampRel(bbox[3])];
};

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

const calculatePartSizes = (parts: GamePart[], imgW: number, _imgH: number): PartWithSize[] => {
  // bbox is in relative coords (0-1), convert to pixels using image width (assuming square)
  const size = imgW;
  return parts.map((part, index) => {
    // Clamp bbox values to prevent invalid dimensions
    const clampedBbox = clampBbox(part.bbox);
    const bounds = bboxToRect(clampedBbox, size);
    return {
      part: { ...part, bbox: clampedBbox },
      index,
      srcW: Math.max(10, bounds.w), // Ensure minimum size
      srcH: Math.max(10, bounds.h),
    };
  });
};

// Draw a simple rect
const drawRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void => {
  ctx.strokeRect(x, y, w, h);
};

// Draw SVG primitive on canvas (converts relative coords to pixels with clamping)
const drawPrimitive = (
  ctx: CanvasRenderingContext2D,
  shape: SVGPrimitive,
  size: number
): void => {
  ctx.beginPath();
  switch (shape.type) {
    case 'circle': {
      const cx = clampRel(shape.cx) * size;
      const cy = clampRel(shape.cy) * size;
      const r = clampRel(shape.r) * size;
      ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
      break;
    }
    case 'ellipse': {
      const cx = clampRel(shape.cx) * size;
      const cy = clampRel(shape.cy) * size;
      const rx = Math.max(1, clampRel(shape.rx) * size);
      const ry = Math.max(1, clampRel(shape.ry) * size);
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      break;
    }
    case 'rect': {
      const x = clampRel(shape.x) * size;
      const y = clampRel(shape.y) * size;
      const w = Math.max(1, clampRel(shape.width) * size);
      const h = Math.max(1, clampRel(shape.height) * size);
      if (shape.rx) {
        const rx = clampRel(shape.rx) * size;
        ctx.roundRect(x, y, w, h, rx);
      } else {
        ctx.rect(x, y, w, h);
      }
      break;
    }
    case 'path': {
      // For path, scale the context - path d values should be 0-1
      ctx.save();
      ctx.scale(size, size);
      ctx.lineWidth = ctx.lineWidth / size;
      try {
        const path = new Path2D(shape.d);
        ctx.stroke(path);
      } catch {
        // Fallback if path parsing fails - draw bbox instead
      }
      ctx.restore();
      return; // Already stroked
    }
  }
  ctx.stroke();
};

// Helper: Normalize shape from global 0-1 coords to local 0-1 coords relative to bbox, then draw in destination rect
const drawNormalizedPrimitive = (
  ctx: CanvasRenderingContext2D,
  shape: SVGPrimitive,
  bbox: [number, number, number, number], // part bbox 0-1
  destRect: Rect
): void => {
  const bboxW = bbox[2] - bbox[0];
  const bboxH = bbox[3] - bbox[1];

  // Helper to map global x (0-1) to local pixels
  const mapX = (gx: number) => {
    const localRel = (gx - bbox[0]) / bboxW;
    return destRect.x + localRel * destRect.w;
  };

  // Helper to map global y (0-1) to local pixels
  const mapY = (gy: number) => {
    const localRel = (gy - bbox[1]) / bboxH;
    return destRect.y + localRel * destRect.h;
  };

  // Helper for scaling dimensions
  const scaleW = (gw: number) => (gw / bboxW) * destRect.w;
  const scaleH = (gh: number) => (gh / bboxH) * destRect.h;

  ctx.beginPath();
  switch (shape.type) {
    case 'circle': {
      const cx = mapX(clampRel(shape.cx));
      const cy = mapY(clampRel(shape.cy));
      // Circle radius likely scaled by width or average? BBox might be non-uniform aspect.
      // Usually r is relative to image width.
      // We map r to the local width scale.
      const r = scaleW(clampRel(shape.r));
      ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
      break;
    }
    case 'ellipse': {
      const cx = mapX(clampRel(shape.cx));
      const cy = mapY(clampRel(shape.cy));
      const rx = scaleW(clampRel(shape.rx));
      const ry = scaleH(clampRel(shape.ry));
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      break;
    }
    case 'rect': {
      const x = mapX(clampRel(shape.x));
      const y = mapY(clampRel(shape.y));
      const w = scaleW(clampRel(shape.width));
      const h = scaleH(clampRel(shape.height));
      if (shape.rx) {
        const rx = scaleW(clampRel(shape.rx));
        ctx.roundRect(x, y, w, h, rx);
      } else {
        ctx.rect(x, y, w, h);
      }
      break;
    }
    case 'path': {
      const bboxW = bbox[2] - bbox[0];
      const bboxH = bbox[3] - bbox[1];

      // Avoid division by zero
      if (bboxW <= 0 || bboxH <= 0) break;

      const sx = destRect.w / bboxW;
      const sy = destRect.h / bboxH;

      const tx = destRect.x - (bbox[0] * sx);
      const ty = destRect.y - (bbox[1] * sy);

      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(sx, sy);

      // Counter-scale line width so it doesn't look huge
      const finalScale = Math.max(sx, sy);
      ctx.lineWidth = ctx.lineWidth / finalScale;

      try {
        const p = new Path2D(shape.d);
        ctx.stroke(p);
      } catch (e) {
        console.warn("Failed to draw path in atlas", e);
      }
      ctx.restore();
      return;
    }
  }
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
    const bounds = bboxToRect(p.part.bbox);
    const num = p.index + 1;

    // Draw dashed bounding box in atlas
    ctx.strokeStyle = "#94a3b8"; // slate-400
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 2]);
    drawRect(ctx, rect.x, rect.y, rect.w, rect.h);
    ctx.setLineDash([]);

    // Draw Vector Shape (Normalized to slot)
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    // We pass the ORIGINAL part bbox (which the shape is relative to)
    // p.part.bbox was clamped in calculatePartSizes, we use that.
    drawNormalizedPrimitive(ctx, p.part.shape, p.part.bbox, rect);

    // Draw Number Label
    const fontSize = Math.min(rect.w, rect.h) * 0.4; // Large number

    // Draw distinct number behind
    ctx.fillStyle = "#e2e8f0"; // slate-200, solid light gray fallback
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
  const size = img.width; // Assuming square image

  // Color palette for different parts
  const colors = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#06b6d4'
  ];

  parts.forEach((part, index) => {
    const num = index + 1;
    const color = colors[index % colors.length];

    // Clamp and convert relative bbox to pixels
    const clampedBbox = clampBbox(part.bbox);
    const bounds = bboxToRect(clampedBbox, size);
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;

    // Draw bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.setLineDash([]);

    // Draw the SVG primitive shape
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    drawPrimitive(ctx, part.shape, size);

    // Draw number label with background
    const fontSize = Math.max(12, Math.min(bounds.w, bounds.h) * 0.3);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Background for text
    const textMetrics = ctx.measureText(`${num}`);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(cx - textMetrics.width / 2 - 4, cy - fontSize / 2 - 2, textMetrics.width + 8, fontSize + 4);

    ctx.fillStyle = color;
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

export const createGeometryComposite = async (
  originalImageBase64: string,
  geometry: SVGPrimitive | null,
  bbox: [number, number, number, number] | null = null
): Promise<string> => {
  const img = await loadImage(`data:image/png;base64,${originalImageBase64}`);
  const w = img.width;
  const h = img.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  // 1. Draw Original Image
  ctx.drawImage(img, 0, 0);

  // 2. Darken overlay (50% black)
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, w, h);

  // 3. Draw Geometry (if available) - Neon Green
  if (geometry) {
    ctx.strokeStyle = "#00ff00"; // Neon Green
    ctx.lineWidth = 3;
    drawPrimitive(ctx, geometry, w);
  }

  // 4. Draw BBox (if available) - Cyan Dashed
  if (bbox) {
    const rect = bboxToRect(bbox, w);
    ctx.strokeStyle = "#00ffff"; // Cyan
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.setLineDash([]);
  }

  return canvas.toDataURL("image/png").split(",")[1];
};
