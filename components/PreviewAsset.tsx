
import React, { useEffect, useRef, useState } from 'react';
import { GamePart, MovementType } from '../types';
import { loadImage } from '../utils/canvasUtils';
import { Download, RefreshCw } from 'lucide-react';

interface Props {
  atlasBase64: string;
  parts: GamePart[];
}

export const PreviewAsset: React.FC<Props> = ({ atlasBase64, parts }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Initialized with 0 to satisfy useRef expected argument count (animation frame IDs are positive integers)
  const requestRef = useRef<number>(0);
  const [atlasImg, setAtlasImg] = useState<HTMLImageElement | null>(null);
  const [showWireframe, setShowWireframe] = useState(false);

  useEffect(() => {
    loadImage(`data:image/png;base64,${atlasBase64}`).then(setAtlasImg);
  }, [atlasBase64]);

  const animate = (time: number) => {
    if (!canvasRef.current || !atlasImg) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const t = time / 1000;
    const scaleFactor = 0.4;

    // Clear and draw grid
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    for(let i=0; i<w; i+=40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,h); ctx.stroke(); }
    for(let i=0; i<h; i+=40) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(w,i); ctx.stroke(); }

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

    // Get canvas position for a part
    // Get bounding rect from polygon
    const getPolygonBounds = (polygon: { x: number; y: number }[]) => {
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

    const getPartPosition = (part: GamePart) => {
      const bounds = getPolygonBounds(part.mask.polygon);
      const partW = bounds.w * scaleFactor;
      const partH = bounds.h * scaleFactor;
      const drawX = (bounds.x * scaleFactor) - (500 * scaleFactor) + cx;
      const drawY = (bounds.y * scaleFactor) - (500 * scaleFactor) + cy;
      // Pivot is now in world pixel coordinates, transform to canvas space
      const pivotX = (part.pivot.x * scaleFactor) - (500 * scaleFactor) + cx;
      const pivotY = (part.pivot.y * scaleFactor) - (500 * scaleFactor) + cy;
      return { drawX, drawY, partW, partH, pivotX, pivotY };
    };

    // Get local animation transform for a part
    const getLocalAnimation = (part: GamePart): { rotate: number; tx: number; ty: number; scale: number } => {
      let rotate = 0, tx = 0, ty = 0, scale = 1;
      switch (part.movementType) {
        case MovementType.ROTATION:
          rotate = Math.sin(t * 3) * 0.2;
          break;
        case MovementType.TRANSLATION_HORIZONTAL:
          tx = Math.sin(t * 5) * 10;
          break;
        case MovementType.TRANSLATION_VERTICAL:
          ty = Math.sin(t * 5) * 10;
          break;
        case MovementType.SCALE_PULSE:
          scale = 1 + Math.sin(t * 4) * 0.05;
          break;
      }
      return { rotate, tx, ty, scale };
    };

    // Recursive render with parent transform inheritance
    const renderPartHierarchy = (part: GamePart, inheritedTransform: DOMMatrix) => {
      const { drawX, drawY, partW, partH, pivotX, pivotY } = getPartPosition(part);
      const anim = getLocalAnimation(part);

      // Build this part's transform matrix around its pivot
      // 1. Translate to pivot
      // 2. Apply rotation/scale
      // 3. Translate back
      // 4. Apply translation animation
      let localTransform = new DOMMatrix();
      localTransform = localTransform.translate(pivotX, pivotY);
      localTransform = localTransform.rotate(anim.rotate * (180 / Math.PI));
      localTransform = localTransform.scale(anim.scale, anim.scale);
      localTransform = localTransform.translate(-pivotX, -pivotY);
      localTransform = localTransform.translate(anim.tx, anim.ty);

      // Combine with inherited parent transform
      const worldTransform = inheritedTransform.multiply(localTransform);

      // Apply world transform and draw
      ctx.save();
      ctx.setTransform(worldTransform);

      if (part.atlasRect) {
        ctx.drawImage(
          atlasImg,
          part.atlasRect.x, part.atlasRect.y, part.atlasRect.w, part.atlasRect.h,
          drawX, drawY, partW, partH
        );

        if (showWireframe) {
          ctx.strokeStyle = "rgba(0,255,0,0.5)";
          ctx.lineWidth = 2;
          ctx.strokeRect(drawX, drawY, partW, partH);
          ctx.fillStyle = "red";
          ctx.beginPath();
          ctx.arc(pivotX, pivotY, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "white";
          ctx.font = "10px sans-serif";
          ctx.fillText(part.name, drawX + 2, drawY + 12);
        }
      }

      ctx.restore();

      // Render children with this part's world transform
      const children = childrenOf.get(part.id) || [];
      // Sort children by area (largest first for proper layering)
      children.sort((a, b) => {
        const boundsA = getPolygonBounds(a.mask.polygon);
        const boundsB = getPolygonBounds(b.mask.polygon);
        const areaA = boundsA.w * boundsA.h;
        const areaB = boundsB.w * boundsB.h;
        return areaB - areaA;
      });
      children.forEach(child => renderPartHierarchy(child, worldTransform));
    };

    // Get root parts (no parent) and sort by area
    const rootParts = childrenOf.get(null) || [];
    rootParts.sort((a, b) => {
      const boundsA = getPolygonBounds(a.mask.polygon);
      const boundsB = getPolygonBounds(b.mask.polygon);
      const areaA = boundsA.w * boundsA.h;
      const areaB = boundsB.w * boundsB.h;
      return areaB - areaA;
    });

    // Render hierarchy starting from roots
    rootParts.forEach(root => renderPartHierarchy(root, new DOMMatrix()));

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      // Clean up the animation frame using the stored ID
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [atlasImg, parts, showWireframe]);

  const handleDownload = () => {
      const link = document.createElement('a');
      link.download = 'generated_asset.png';
      link.href = `data:image/png;base64,${atlasBase64}`;
      link.click();
  };

  return (
    <div className="space-y-4">
      <div className="bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-700">
        <canvas 
            ref={canvasRef} 
            width={600} 
            height={400} 
            className="w-full h-auto bg-slate-900"
        />
      </div>
      
      <div className="flex items-center justify-between">
         <div className="flex items-center gap-2">
            <input 
                type="checkbox" 
                id="wireframe" 
                checked={showWireframe} 
                onChange={e => setShowWireframe(e.target.checked)}
                className="rounded bg-slate-700 border-slate-600 text-indigo-500"
            />
            <label htmlFor="wireframe" className="text-sm text-slate-300">Show Pivots & Boxes</label>
         </div>

         <button 
            onClick={handleDownload}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
         >
            <Download className="w-4 h-4" />
            Download Atlas
         </button>
      </div>
    </div>
  );
};
