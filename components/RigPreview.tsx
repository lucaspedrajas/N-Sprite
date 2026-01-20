import React, { useEffect, useRef, useState } from 'react';
import { GamePart, MovementType, bboxToRect, relToPixel, SVGPrimitive } from '../types';
import { loadImage } from '../utils/canvasUtils';
import { Play, Pause, RotateCcw, Eye, EyeOff, CheckCircle, ChevronRight } from 'lucide-react';

interface Props {
  originalImageBase64: string;
  parts: GamePart[];
  onConfirm: () => void;
  onRetry: () => void;
  compact?: boolean;
}

// Clamp relative values to 0-1 range
const clampRel = (v: number): number => Math.max(0, Math.min(1, v));
const clampBbox = (bbox: [number, number, number, number]): [number, number, number, number] => {
  return [clampRel(bbox[0]), clampRel(bbox[1]), clampRel(bbox[2]), clampRel(bbox[3])];
};

// Scale SVG path data from relative (0-1) to pixel coordinates
const scalePathData = (pathData: string, scale: number): string => {
  let d = pathData.trim();
  // Ensure path is closed
  if (!d.toUpperCase().endsWith('Z')) {
    d += ' Z';
  }
  
  // Parse and scale path commands
  return d.replace(
    /([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi,
    (match, cmd, coords) => {
      const upperCmd = cmd.toUpperCase();
      if (upperCmd === 'Z') return cmd;
      if (upperCmd === 'H') {
        const x = parseFloat(coords.trim()) * scale;
        return `${cmd}${x}`;
      }
      if (upperCmd === 'V') {
        const y = parseFloat(coords.trim()) * scale;
        return `${cmd}${y}`;
      }
      // Scale all coordinate values
      const scaled = coords.trim().split(/[\s,]+/).map((n: string) => {
        const val = parseFloat(n);
        return isNaN(val) ? n : (val * scale).toString();
      }).join(' ');
      return `${cmd}${scaled}`;
    }
  );
};

// Build a Path2D clipping shape from SVG primitive
const buildClipPath2D = (shape: SVGPrimitive, imgSize: number): Path2D => {
  const path = new Path2D();
  
  switch (shape.type) {
    case 'circle': {
      const cx = clampRel(shape.cx) * imgSize;
      const cy = clampRel(shape.cy) * imgSize;
      const r = Math.max(1, clampRel(shape.r) * imgSize);
      path.arc(cx, cy, r, 0, Math.PI * 2);
      path.closePath();
      break;
    }
    case 'ellipse': {
      const cx = clampRel(shape.cx) * imgSize;
      const cy = clampRel(shape.cy) * imgSize;
      const rx = Math.max(1, clampRel(shape.rx) * imgSize);
      const ry = Math.max(1, clampRel(shape.ry) * imgSize);
      path.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      path.closePath();
      break;
    }
    case 'rect': {
      const x = clampRel(shape.x) * imgSize;
      const y = clampRel(shape.y) * imgSize;
      const w = Math.max(1, clampRel(shape.width) * imgSize);
      const h = Math.max(1, clampRel(shape.height) * imgSize);
      if (shape.rx) {
        const rx = clampRel(shape.rx) * imgSize;
        path.roundRect(x, y, w, h, rx);
      } else {
        path.rect(x, y, w, h);
      }
      path.closePath();
      break;
    }
    case 'path': {
      try {
        const scaledPath = scalePathData(shape.d, imgSize);
        path.addPath(new Path2D(scaledPath));
      } catch (e) {
        console.warn('Path parsing failed:', e);
        // Return empty path, will show nothing
      }
      break;
    }
  }
  
  return path;
};

export const RigPreview: React.FC<Props> = ({ originalImageBase64, parts, onConfirm, onRetry, compact }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const [originalImg, setOriginalImg] = useState<HTMLImageElement | null>(null);
  const [showWireframe, setShowWireframe] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const timeRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  useEffect(() => {
    loadImage(`data:image/png;base64,${originalImageBase64}`).then(setOriginalImg);
  }, [originalImageBase64]);

  const animate = (timestamp: number) => {
    if (!canvasRef.current || !originalImg) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Update time based on playing state
    if (isPlaying) {
      const delta = (timestamp - lastFrameRef.current) / 1000;
      timeRef.current += delta * animationSpeed;
    }
    lastFrameRef.current = timestamp;
    const t = timeRef.current;

    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const scaleFactor = 0.5;
    const imgSize = originalImg.width;

    // Clear and draw grid
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
    for (let i = 0; i < h; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }

    const cx = w / 2;
    const cy = h / 2;

    // Build parent-child lookup
    const partsById = new Map(parts.map(p => [p.id, p]));
    const childrenOf = new Map<string | null, GamePart[]>();
    parts.forEach(p => {
      const parentKey = p.parentId || null;
      if (!childrenOf.has(parentKey)) childrenOf.set(parentKey, []);
      childrenOf.get(parentKey)!.push(p);
    });

    // Get canvas position for a part using bbox (relative 0-1 coords)
    const getPartPosition = (part: GamePart) => {
      const clampedBbox = clampBbox(part.bbox);
      const bounds = bboxToRect(clampedBbox, imgSize);
      const partW = bounds.w * scaleFactor;
      const partH = bounds.h * scaleFactor;
      const drawX = (bounds.x * scaleFactor) - (imgSize / 2 * scaleFactor) + cx;
      const drawY = (bounds.y * scaleFactor) - (imgSize / 2 * scaleFactor) + cy;
      // Pivot is in relative coords (0-1), convert to canvas space
      const pivotPx = clampRel(part.pivot.x) * imgSize;
      const pivotPy = clampRel(part.pivot.y) * imgSize;
      const pivotX = (pivotPx * scaleFactor) - (imgSize / 2 * scaleFactor) + cx;
      const pivotY = (pivotPy * scaleFactor) - (imgSize / 2 * scaleFactor) + cy;
      return { bounds, drawX, drawY, partW, partH, pivotX, pivotY };
    };

    // Get local animation transform for a part
    const getLocalAnimation = (part: GamePart): { rotate: number; tx: number; ty: number; scale: number } => {
      let rotate = 0, tx = 0, ty = 0, scale = 1;
      switch (part.movementType) {
        case MovementType.ROTATION:
          rotate = Math.sin(t * 3) * 0.25;
          break;
        case MovementType.SLIDING:
          tx = Math.sin(t * 4) * 15;
          ty = Math.sin(t * 4 + 0.5) * 8;
          break;
        case MovementType.ELASTIC:
          scale = 1 + Math.sin(t * 5) * 0.1;
          break;
        case MovementType.FIXED:
        default:
          break;
      }
      return { rotate, tx, ty, scale };
    };

    // Recursive render with parent transform inheritance
    const renderPartHierarchy = (part: GamePart, inheritedTransform: DOMMatrix) => {
      const { bounds, drawX, drawY, partW, partH, pivotX, pivotY } = getPartPosition(part);
      const anim = getLocalAnimation(part);

      // Build this part's transform matrix around its pivot
      let localTransform = new DOMMatrix();
      localTransform = localTransform.translate(pivotX, pivotY);
      localTransform = localTransform.rotate(anim.rotate * (180 / Math.PI));
      localTransform = localTransform.scale(anim.scale, anim.scale);
      localTransform = localTransform.translate(-pivotX, -pivotY);
      localTransform = localTransform.translate(anim.tx, anim.ty);

      // Combine with inherited parent transform
      const worldTransform = inheritedTransform.multiply(localTransform);

      // Apply world transform and draw with shape clipping
      ctx.save();
      ctx.setTransform(worldTransform);

      // Create an off-screen canvas to cut out the shape
      const offCanvas = document.createElement('canvas');
      offCanvas.width = bounds.w;
      offCanvas.height = bounds.h;
      const offCtx = offCanvas.getContext('2d');
      
      if (offCtx) {
        // Build clipping Path2D in source image coordinates
        const clipPath = buildClipPath2D(part.shape, imgSize);
        
        // Translate clip path to local canvas coords and apply
        offCtx.save();
        offCtx.translate(-bounds.x, -bounds.y);
        offCtx.clip(clipPath);
        offCtx.translate(bounds.x, bounds.y);
        
        // Draw the portion of the original image
        offCtx.drawImage(
          originalImg,
          bounds.x, bounds.y, bounds.w, bounds.h,
          0, 0, bounds.w, bounds.h
        );
        offCtx.restore();
        
        // Draw the clipped result to main canvas
        ctx.drawImage(offCanvas, drawX, drawY, partW, partH);
      }

      if (showWireframe) {
        // Draw shape outline (scaled to canvas)
        const outlinePath = buildClipPath2D(part.shape, imgSize);
        ctx.save();
        ctx.translate(drawX - bounds.x * scaleFactor, drawY - bounds.y * scaleFactor);
        ctx.scale(scaleFactor, scaleFactor);
        ctx.strokeStyle = "rgba(0,255,0,0.8)";
        ctx.lineWidth = 2 / scaleFactor;
        ctx.stroke(outlinePath);
        ctx.restore();

        // Draw pivot point
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw movement indicator
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(drawX, drawY - 18, partW, 16);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "left";
        const moveIcon = part.movementType === 'ROTATION' ? '↻' :
          part.movementType === 'SLIDING' ? '↔' :
            part.movementType === 'ELASTIC' ? '~' : '●';
        ctx.fillText(`${moveIcon} ${part.name}`, drawX + 2, drawY - 6);
      }

      ctx.restore();

      // Render children with this part's world transform
      const children = childrenOf.get(part.id) || [];
      children.sort((a, b) => {
        const boundsA = bboxToRect(clampBbox(a.bbox), imgSize);
        const boundsB = bboxToRect(clampBbox(b.bbox), imgSize);
        return (boundsB.w * boundsB.h) - (boundsA.w * boundsA.h);
      });
      children.forEach(child => renderPartHierarchy(child, worldTransform));
    };

    // Get root parts (no parent) and sort by area (largest first)
    const rootParts = childrenOf.get(null) || [];
    rootParts.sort((a, b) => {
      const boundsA = bboxToRect(clampBbox(a.bbox), imgSize);
      const boundsB = bboxToRect(clampBbox(b.bbox), imgSize);
      return (boundsB.w * boundsB.h) - (boundsA.w * boundsA.h);
    });

    // Render hierarchy starting from roots
    rootParts.forEach(root => renderPartHierarchy(root, new DOMMatrix()));

    // Draw play/pause indicator
    if (!isPlaying) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(w / 2 - 30, h / 2 - 30, 60, 60);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(w / 2 - 10, h / 2 - 15);
      ctx.lineTo(w / 2 - 10, h / 2 + 15);
      ctx.lineTo(w / 2 + 15, h / 2);
      ctx.closePath();
      ctx.fill();
    }

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    lastFrameRef.current = performance.now();
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [originalImg, parts, showWireframe, isPlaying, animationSpeed]);

  const handleReset = () => {
    timeRef.current = 0;
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="flex items-center gap-3 mb-4">
        <Play className="w-5 h-5 text-amber-400" />
        <h3 className="text-lg font-semibold text-white">Rig Preview</h3>
        <span className="text-xs text-slate-500">Verify animation before generating sprites</span>
      </div>

      <div className="bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-600 mb-4">
        <canvas
          ref={canvasRef}
          width={600}
          height={450}
          className="w-full h-auto bg-slate-900 cursor-pointer"
          onClick={() => setIsPlaying(!isPlaying)}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-2 rounded-lg transition-colors ${isPlaying ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}`}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={handleReset}
            className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Speed:</span>
          {[0.5, 1, 2].map(speed => (
            <button
              key={speed}
              onClick={() => setAnimationSpeed(speed)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${animationSpeed === speed ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowWireframe(!showWireframe)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showWireframe ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
            }`}
        >
          {showWireframe ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          Wireframe
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-4 border-t border-slate-700">
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors"
        >
          Re-analyze
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors"
        >
          <CheckCircle className="w-4 h-4" />
          Confirm Rig & Continue
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
