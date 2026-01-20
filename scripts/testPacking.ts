
import potpack from 'potpack';

const BOX_PADDING = 16;

interface PartWithSize {
    srcW: number;
    srcH: number;
    part: {
        atlasRect?: { x: number, y: number, w: number, h: number }
    }
}

const packWithPotpack = (partsWithSize: PartWithSize[], resolution: number): PartWithSize[] => {
    // 1. Initial scale estimate
    const totalArea = partsWithSize.reduce((sum, p) => sum + p.srcW * p.srcH, 0);
    // use slightly smaller area to be safe
    const availableArea = (resolution - BOX_PADDING * 2) ** 2;
    let scale = Math.sqrt(availableArea / totalArea) * 0.90;

    // Retry loop stats
    let finalScale = scale;
    let success = false;

    // We'll try up to 10 times, reducing scale if it doesn't fit
    for (let attempt = 0; attempt < 10; attempt++) {
        // 2. Prepare items for potpack (with padding)
        // potpack modifies items in-place, so we map to a temporary array
        interface Box { w: number; h: number; index: number; x?: number; y?: number }
        const boxes: Box[] = partsWithSize.map((p, i) => ({
            w: Math.ceil(p.srcW * scale) + BOX_PADDING,
            h: Math.ceil(p.srcH * scale) + BOX_PADDING,
            index: i
        }));

        // 3. Pack
        const { w: packedW, h: packedH } = potpack(boxes);

        // 4. Check if it fits (with a tiny margin for float comparison safety if it was float, but potpack is usually safe)
        if (packedW <= resolution - BOX_PADDING && packedH <= resolution - BOX_PADDING) { // Considering padding logic
            // Wait, potpack returns the bounding box of packed items. 
            // If packedW is within the box, we are good.
            // But we add padding to x,y in the final output.
            // If potpack makes packedW = 1000, and our resolution is 1000.
            // Last item ends at 1000.
            // We map x = box.x + 16. If box.x = 900, box.w = 100. ends at 1000.
            // New x = 916. New end = 916 + (100-16) = 1000. 
            // So if potpack fit in resolution - 2*padding?
            // No, available width is resolution for the outer container?
            // The constraint is: item.x + item.w <= resolution.
            // Our item.w (atlasRect.w) = box.w - padding.
            // atlasRect.x = box.x + padding.
            // atlasRect.x + atlasRect.w = box.x + padding + box.w - padding = box.x + box.w.
            // So if potpack packed width <= resolution - padding (for left side?)
            // We offset everything by BOX_PADDING.
            // So max coordinate is box.x + box.w + BOX_PADDING.
            // Wait, if box.x=0, atlasRect.x = 16.
            // box.w includes left and right padding? No, we just added padding to src dims. 
            // Let's say src=100. box.w = 116.
            // box.x=0. atlasRect.x = 16. atlasRect.w = 100.
            // Ends at 116.
            // potpack says w=116.
            // If resolution is 116.
            // We fit.
            // BUT, if we have right padding as well... 
            // If we want a margin around the whole atlas?
            // Usually valid region is [PAD, resolution-PAD].
            // So max coord must be <= resolution - PAD.
            // So potpack width + PAD <= resolution - PAD => potpack width <= resolution - 2*PAD.
            // My code check was:
            // if (packedW <= resolution - BOX_PADDING && packedH <= resolution - BOX_PADDING)
            // This allows packed content to go up to resolution - PAD.
            // Since we shift by PAD, the final edge is packedW + PAD.
            // So packedW + PAD <= resolution.
            // => packedW <= resolution - PAD.
            // So my check is correct for 1-sided padding? 
            // Wait, "resolution - BOX_PADDING * 2" available area calc implied 2 sided.
            // Let's stick to `packedW <= resolution - 2 * BOX_PADDING` to be safe and symmetric.

            // Adjusting check for strict safety
            if (packedW <= resolution - BOX_PADDING * 2 && packedH <= resolution - BOX_PADDING * 2) {
                // Success! Apply back to parts
                boxes.forEach(box => {
                    const p = partsWithSize[box.index];
                    const b = box as Required<Box>;
                    p.part.atlasRect = {
                        x: Math.round(b.x + BOX_PADDING),
                        y: Math.round(b.y + BOX_PADDING),
                        w: Math.round(b.w - BOX_PADDING),
                        h: Math.round(b.h - BOX_PADDING)
                    };
                });
                finalScale = scale;
                success = true;
                break;
            }
        }

        // Fit failed, reduce scale
        const maxDim = Math.max(packedW, packedH);
        const target = resolution - BOX_PADDING * 2;
        const factor = target / maxDim;
        scale *= (factor * 0.95);
    }

    if (!success) {
        console.warn("Failed to pack");
    }
    return partsWithSize;
};


// TEST
const runTest = () => {
    const parts: PartWithSize[] = [];
    // 1. Add some very wide parts
    for (let i = 0; i < 5; i++) {
        parts.push({ srcW: 500, srcH: 50, part: {} });
    }
    // 2. Add some big squares
    for (let i = 0; i < 3; i++) {
        parts.push({ srcW: 400, srcH: 400, part: {} });
    }
    // 3. Add many small ones
    for (let i = 0; i < 20; i++) {
        parts.push({ srcW: 50, srcH: 50, part: {} });
    }

    const resolution = 1024;
    console.log("Starting pack test...");
    packWithPotpack(parts, resolution);

    let overflow = false;
    let overlap = false;

    // Verify
    parts.forEach((p, i) => {
        const r = p.part.atlasRect;
        if (!r) {
            console.error(`Part ${i} has no atlasRect!`);
            return;
        }
        // Check bounds
        if (r.x < BOX_PADDING || r.y < BOX_PADDING || r.x + r.w > resolution - BOX_PADDING || r.y + r.h > resolution - BOX_PADDING) {
            console.error(`Part ${i} out of bounds:`, r);
            overflow = true;
        }

        // Check overlap
        for (let j = i + 1; j < parts.length; j++) {
            const r2 = parts[j].part.atlasRect;
            if (r2) {
                if (r.x < r2.x + r2.w && r.x + r.w > r2.x && r.y < r2.y + r2.h && r.y + r.h > r2.y) {
                    console.error(`Part ${i} overlaps Part ${j}`, r, r2);
                    overlap = true;
                }
            }
        }
    });

    if (!overflow && !overlap) {
        console.log("SUCCESS: All parts packed within bounds and no overlaps.");
    } else {
        console.log("FAILURE: Issues detected.");
    }
}

runTest();
