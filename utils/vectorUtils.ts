import { SVGPrimitive } from '../types';
// @ts-ignore
import ImageTracer from 'imagetracerjs';

// Helper to scale path data
const scalePathData = (d: string, width: number, height: number): string => {
    return d.replace(/[-+]?\d*\.?\d+/g, (match) => {
        const num = parseFloat(match);
        return (num / width).toFixed(4); // Keep precision
    });
};

// Helper to check if a path is essentially the image border
const isBorderPath = (d: string, width: number, height: number): boolean => {
    const numbers = d.match(/[-+]?\d*\.?\d+/g)?.map(parseFloat);
    if (!numbers || numbers.length < 4) return false;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (let i = 0; i < numbers.length; i += 2) {
        const x = numbers[i];
        const y = numbers[i + 1];

        if (typeof x === 'number') {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
        }
        if (typeof y === 'number') {
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }

    const tolerance = 4; // pixels

    const touchesLeft = minX <= tolerance;
    const touchesTop = minY <= tolerance;
    const touchesRight = maxX >= width - tolerance;
    const touchesBottom = maxY >= height - tolerance;

    // If it touches all 4 sides, it's likely the full frame border
    return touchesLeft && touchesTop && touchesRight && touchesBottom;
};

export const maskToSVG = async (maskBase64: string): Promise<SVGPrimitive> => {
    return new Promise((resolve, reject) => {
        // Load image first to get dimensions and process alpha
        const img = new Image();
        img.onload = () => {
            const width = img.width;
            const height = img.height;

            // Create canvas to convert alpha channel to B&W mask
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error("Failed to get canvas context for vectorization"));
                return;
            }

            // Draw original image (segmented object on transparent bg)
            ctx.drawImage(img, 0, 0);

            // Get raw pixel data
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;

            // Convert to binary mask: Alpha > threshold becomes Black, else White
            // We set Alpha to 255 for all to ensure ImageTracer sees it as a solid image
            for (let i = 0; i < data.length; i += 4) {
                const alpha = data[i + 3];

                // If pixel has significant opacity, treat as object (Black)
                // otherwise treat as background (White)
                if (alpha > 20) {
                    // Object -> White
                    data[i] = 255;     // R
                    data[i + 1] = 255; // G
                    data[i + 2] = 255; // B
                    data[i + 3] = 255; // Alpha
                } else {
                    // Background -> Black
                    data[i] = 0;   // R
                    data[i + 1] = 0; // G
                    data[i + 2] = 0; // B
                    data[i + 3] = 255; // Alpha
                }
            }

            // Write back processed data
            ctx.putImageData(imageData, 0, 0);

            // Use the processed B&W mask for tracing
            const processedDataUrl = canvas.toDataURL('image/png');

            // Options for tracing - optimized for simple shapes
            const options = {
                ltres: 1, // Linear error threshold
                qtres: 1, // Quadratic error threshold
                pathomit: 8, // Path omission (pixels)
                colorsampling: 0, // Disable color sampling, assume binary
                numberofcolors: 2,
                mincolorratio: 0,
                colorquantcycles: 1,
                scale: 1,
                simplification: 0, // 0-1
                strokewidth: 0,
                viewbox: true,
                desc: false,
            };

            ImageTracer.imageToSVG(
                processedDataUrl,
                (svgStr: string) => {
                    // Extract all path data 'd'
                    const pathMatches = svgStr.matchAll(/d="([^"]+)"/g);
                    let combinedD = "";
                    let pathCount = 0;

                    for (const match of pathMatches) {
                        const d = match[1];
                        if (!isBorderPath(d, width, height)) {
                            combinedD += d + " ";
                            pathCount++;
                        }
                    }

                    if (combinedD.trim()) {
                        // Scale the coordinates
                        const scaledD = scalePathData(combinedD, width, height);

                        resolve({
                            type: 'path',
                            d: scaledD
                        });
                    } else {
                        // If we filtered everything, maybe the object WAS the border? (unlikely for parts)
                        // Or maybe something went wrong.
                        if (pathCount === 0) reject(new Error("Only border paths found (empty segmentation?)"));
                        else reject(new Error("No path found in vectorized mask"));
                    }
                },
                options
            );
        };
        img.onerror = () => reject(new Error("Failed to load mask image"));
        img.src = `data:image/png;base64,${maskBase64}`;
    });
};
