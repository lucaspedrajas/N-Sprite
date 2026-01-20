import { SVGPrimitive } from '../types';

// Clamp relative values to 0-1 range
export const clampRel = (v: number): number => Math.max(0, Math.min(1, v));

export const clampBbox = (bbox: [number, number, number, number]): [number, number, number, number] => {
    return [clampRel(bbox[0]), clampRel(bbox[1]), clampRel(bbox[2]), clampRel(bbox[3])];
};

// Scale SVG path data from relative (0-1) to pixel coordinates
export const scalePathData = (pathData: string, scale: number): string => {
    let d = pathData.trim();
    // Ensure path is closed
    if (!d.toUpperCase().endsWith('Z')) {
        d += ' Z';
    }

    // Parse and scale path commands
    // This simple regex replacement handles basic Move, Line, Horizontal, Vertical, Curve, Quad, Arc, Close
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
            const scaled = coords.trim().split(/[\s,]+/).filter(s => s).map((n: string) => {
                const val = parseFloat(n);
                return isNaN(val) ? n : (val * scale).toString();
            }).join(' ');

            return `${cmd}${scaled}`;
        }
    );
};

// Apply clipping to a canvas context based on SVG primitive
export const applyClipPath = (ctx: CanvasRenderingContext2D, shape: SVGPrimitive, imgSize: number) => {
    ctx.beginPath();

    switch (shape.type) {
        case 'circle': {
            const cx = clampRel(shape.cx) * imgSize;
            const cy = clampRel(shape.cy) * imgSize;
            const r = Math.max(1, clampRel(shape.r) * imgSize);
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.closePath();
            break;
        }
        case 'ellipse': {
            const cx = clampRel(shape.cx) * imgSize;
            const cy = clampRel(shape.cy) * imgSize;
            const rx = Math.max(1, clampRel(shape.rx) * imgSize);
            const ry = Math.max(1, clampRel(shape.ry) * imgSize);
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.closePath();
            break;
        }
        case 'rect': {
            const x = clampRel(shape.x) * imgSize;
            const y = clampRel(shape.y) * imgSize;
            const w = Math.max(1, clampRel(shape.width) * imgSize);
            const h = Math.max(1, clampRel(shape.height) * imgSize);
            if (shape.rx) {
                const rx = clampRel(shape.rx) * imgSize;
                ctx.roundRect(x, y, w, h, rx);
            } else {
                ctx.rect(x, y, w, h);
            }
            ctx.closePath();
            break;
        }
        case 'path': {
            try {
                const scaledPath = scalePathData(shape.d, imgSize);
                // Path2D is not directly usable in context.clip() in all environments if passed as object,
                // but passing the path object to clip() works in modern browsers.
                // However, Konva's clipFunc passes the native context.
                // We can create a Path2D and stroke it or clip it.
                // But context.clip(path2d) might not be fully supported in the Konva wrapper context depending on version.
                // Safer to rely on standard drawing commands if possible, but parsing path string simply is hard.
                // We will assume Path2D works or fallback to just drawing it.
                const path = new Path2D(scaledPath);
                ctx.clip(path);
                return; // clip called heavily
            } catch (e) {
                console.warn('Path parsing failed:', e);
            }
            break;
        }
    }

    ctx.clip();
};
