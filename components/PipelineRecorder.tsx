
import React, { useEffect, useRef, useState } from 'react';
import { Video, Download, X, Play } from 'lucide-react';
import { AppState, GamePart, PipelineDebugData, SVGPrimitive, WorkerEvent } from '../types';
import { bboxToRect, MovementType } from '../types';

interface TreeNode {
    part: GamePart;
    children: TreeNode[];
}

const buildTree = (parts: GamePart[]): TreeNode[] => {
    const map = new Map<string, TreeNode>();
    parts.forEach(p => map.set(p.id, { part: p, children: [] }));

    const roots: TreeNode[] = [];
    parts.forEach(p => {
        const node = map.get(p.id)!;
        if (p.parentId && map.has(p.parentId)) {
            map.get(p.parentId)!.children.push(node);
        } else {
            roots.push(node);
        }
    });
    return roots;
};

interface PipelineRecorderProps {
    originalImage: string;
    debugData: PipelineDebugData | null;
    analysisResults: GamePart[] | null;
    generatedAtlas: string | null;
    onClose: () => void;
}

export const PipelineRecorder: React.FC<PipelineRecorderProps> = ({
    originalImage,
    debugData,
    analysisResults,
    generatedAtlas,
    onClose
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Ready');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const animationRef = useRef<number>(0);

    // Assets refs
    const imgRef = useRef<HTMLImageElement>(new Image());
    const atlasImgRef = useRef<HTMLImageElement>(new Image());

    const WIDTH = 1024;
    const HEIGHT = 1024;
    const FPS = 30;

    // Timeline Configuration (in seconds)
    const T_INTRO = 1.0;
    const T_DIRECTOR = 2.0;   // Faster (was 4.0)
    const T_WORKERS = 3.0;    // Faster (was 10.0)
    const T_ARCHITECT = 2.0; // Slightly faster (was 4.0)
    const T_ATLAS_PREP = 3.0; // Longer for interpolation (was 4.0)
    const T_ATLAS_GEN = 2.0;
    const T_ASSEMBLY = 2.0;   // New: Atlas -> Rig
    const T_FINAL_ANIM = 3.0;

    const TOTAL_DURATION = T_INTRO + T_DIRECTOR + T_WORKERS + T_ARCHITECT + T_ATLAS_PREP + T_ATLAS_GEN + T_ASSEMBLY + T_FINAL_ANIM + 1;

    useEffect(() => {
        // Preload images
        imgRef.current.src = `data:image/png;base64,${originalImage}`;
        if (generatedAtlas) {
            atlasImgRef.current.src = `data:image/png;base64,${generatedAtlas}`;
        }
    }, [originalImage, generatedAtlas]);

    const startRecording = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        setStatus('Recording...');
        setIsRecording(true);
        setProgress(0);
        chunksRef.current = [];

        const stream = canvas.captureStream(FPS);
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';

        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 }); // 5Mbps

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `n-sprite-pipeline-${Date.now()}.webm`;
            a.click();
            setIsRecording(false);
            setStatus('Complete!');
            setTimeout(() => setStatus('Ready'), 2000);
        };

        mediaRecorderRef.current = recorder;
        recorder.start();

        const startTime = performance.now();

        const renderLoop = (now: number) => {
            const elapsed = (now - startTime) / 1000;

            // Update Progress
            setProgress(Math.min(100, (elapsed / TOTAL_DURATION) * 100));

            renderFrame(canvas, elapsed);

            if (elapsed < TOTAL_DURATION) {
                animationRef.current = requestAnimationFrame(renderLoop);
            } else {
                recorder.stop();
                cancelAnimationFrame(animationRef.current!);
            }
        };

        animationRef.current = requestAnimationFrame(renderLoop);
    };

    const renderFrame = (canvas: HTMLCanvasElement, t: number) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.fillStyle = '#0f172a'; // Slate-900 background
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // --- Scene 1: Intro (0 -> T_INTRO) ---
        // Fade in original image
        if (t < T_INTRO) {
            const opacity = Math.min(1, t / (T_INTRO * 0.5));
            ctx.globalAlpha = opacity;
            ctx.drawImage(imgRef.current, 0, 0, WIDTH, HEIGHT);
            ctx.globalAlpha = 1;

            ctx.fillStyle = `rgba(0,0,0,${0.6 * opacity})`;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            // Title
            ctx.save();
            ctx.translate(WIDTH / 2, HEIGHT / 2);
            const scale = 1 + (1 - opacity) * 0.5;
            ctx.scale(scale, scale);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 80px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("PIPELINE ANALYSIS", 0, 0);
            ctx.restore();
        }

        // --- Scene 2: Director (T_INTRO -> +T_DIRECTOR) ---
        else if (t < T_INTRO + T_DIRECTOR) {
            const localT = t - T_INTRO;
            ctx.drawImage(imgRef.current, 0, 0, WIDTH, HEIGHT);

            // Draw Dark Overlay
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            // Header
            ctx.fillStyle = '#a78bfa'; // violet-400
            ctx.font = 'bold 40px monospace';
            ctx.fillText("> DIRECTOR_AGENT: IDENTIFYING PARTS...", 40, 60);

            if (debugData?.directorOutput) {
                const parts = debugData.directorOutput;
                // Animate parts appearing one by one
                const partDuration = (T_DIRECTOR - 1) / parts.length;
                const activePartIndex = Math.floor(localT / partDuration);

                parts.forEach((part, idx) => {
                    if (idx > activePartIndex + 1) return;

                    const alpha = idx === activePartIndex
                        ? Math.min(1, (localT - idx * partDuration) * 5) // fade in
                        : 1;

                    // BBox
                    const rect = bboxToRect(part.bbox, WIDTH);

                    ctx.strokeStyle = `rgba(167, 139, 250, ${alpha})`; // violet
                    ctx.lineWidth = 4;
                    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

                    // Label
                    if (alpha > 0.5) {
                        ctx.fillStyle = '#8b5cf6'; // violet-500
                        ctx.fillRect(rect.x, rect.y - 30, ctx.measureText(part.name).width + 20, 30);
                        ctx.fillStyle = '#fff';
                        ctx.font = 'bold 20px sans-serif';
                        ctx.textAlign = 'left';
                        ctx.fillText(part.name, rect.x + 10, rect.y - 8);
                    }
                });
            }
        }

        // --- Scene 3: Workers ( -> +T_WORKERS) ---
        else if (t < T_INTRO + T_DIRECTOR + T_WORKERS) {
            const localT = t - (T_INTRO + T_DIRECTOR);
            ctx.drawImage(imgRef.current, 0, 0, WIDTH, HEIGHT);
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            ctx.fillStyle = '#fbbf24'; // amber-400
            ctx.font = 'bold 40px monospace';
            ctx.fillText("> WORKER_AGENTS: EXTRACTING GEOMETRY...", 40, 60);

            if (debugData?.workerOutputs) {
                const parts = debugData.workerOutputs;
                const timePerPart = T_WORKERS / (parts.length || 1);

                // Focus on one part at a time
                const activePartIdx = Math.min(parts.length - 1, Math.floor(localT / timePerPart));
                const part = parts[activePartIdx];

                if (part) {
                    const partLocalT = localT % timePerPart;
                    const progress = partLocalT / timePerPart;

                    // Show history if available
                    const history = debugData.workerHistory?.find(h => h.manifestId === part.id);
                    let currentShape = part.shape;
                    let stepLabel = "Reviewing";

                    if (history && history.events.length > 0) {
                        const eventIdx = Math.floor(progress * history.events.length);
                        const evt = history.events[Math.min(eventIdx, history.events.length - 1)];
                        if (evt.shape) currentShape = evt.shape;
                        stepLabel = `Iteration ${evt.turn || 0}`;
                    }

                    // Spotlight effect on Part
                    ctx.save();
                    const rect = bboxToRect(part.bbox, WIDTH);
                    ctx.beginPath();
                    ctx.rect(rect.x, rect.y, rect.w, rect.h);
                    ctx.clip();
                    ctx.drawImage(imgRef.current, 0, 0, WIDTH, HEIGHT); // Draw clear image inside clip
                    ctx.restore();

                    // Draw Shape being fitted
                    ctx.strokeStyle = '#fbbf24'; // Amber
                    ctx.lineWidth = 4;
                    ctx.shadowColor = '#fbbf24';
                    ctx.shadowBlur = 20;
                    drawPrimitive(ctx, currentShape, WIDTH);
                    ctx.shadowBlur = 0;

                    // Info card
                    ctx.fillStyle = 'white';
                    ctx.font = '24px monospace';
                    ctx.fillText(`Part: ${part.id}`, 40, 120);
                    ctx.fillText(`Shape: ${currentShape.type.toUpperCase()}`, 40, 150);
                    ctx.fillText(`Status: ${stepLabel}`, 40, 180);
                }
            }
        }

        // --- Scene 4: Architect ( -> +T_ARCHITECT) ---
        else if (t < T_INTRO + T_DIRECTOR + T_WORKERS + T_ARCHITECT) {
            const localT = t - (T_INTRO + T_DIRECTOR + T_WORKERS);
            ctx.drawImage(imgRef.current, 0, 0, WIDTH, HEIGHT);
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            ctx.fillStyle = '#34d399'; // emerald-400
            ctx.font = 'bold 40px monospace';
            ctx.fillText("> ARCHITECT_AGENT: RIGGING HIERARCHY...", 40, 60);

            if (analysisResults) {
                // Re-draw all final shapes first faintly
                ctx.strokeStyle = '#34d399';
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.3;
                analysisResults.forEach(p => drawPrimitive(ctx, p.shape, WIDTH));
                ctx.globalAlpha = 1;

                // Draw Skeleton / Hierarchy
                analysisResults.forEach(part => {
                    if (part.parentId) {
                        const parent = analysisResults.find(p => p.id === part.parentId);
                        if (parent) {
                            const p1 = { x: part.pivot.x * WIDTH, y: part.pivot.y * WIDTH };
                            const p2 = { x: parent.pivot.x * WIDTH, y: parent.pivot.y * WIDTH };

                            // Draw bone connection
                            ctx.beginPath();
                            ctx.moveTo(p1.x, p1.y);
                            ctx.lineTo(p2.x, p2.y);
                            ctx.strokeStyle = '#fff';
                            ctx.lineWidth = 4;
                            ctx.stroke();

                            // Pivot point
                            ctx.beginPath();
                            ctx.arc(p1.x, p1.y, 8, 0, Math.PI * 2);
                            ctx.fillStyle = '#ef4444'; // red pivot
                            ctx.fill();
                        }
                    }
                });
            }
        }

        // --- Scene 5: Atlas Prep (Interpolation: Annotated -> Layout) ---
        else if (t < T_INTRO + T_DIRECTOR + T_WORKERS + T_ARCHITECT + T_ATLAS_PREP) {
            const localT = t - (T_INTRO + T_DIRECTOR + T_WORKERS + T_ARCHITECT);
            // Start after 0.5s, end 1s before scene end to hold final state.
            const animDuration = T_ATLAS_PREP - 1.5;
            const progress = Math.min(1, Math.max(0, (localT - 0.5) / animDuration));

            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
            ctx.fillStyle = '#f472b6';
            ctx.font = 'bold 40px monospace';
            ctx.fillText("> ATLAS_AGENT: PACKING SPRITES...", 40, 60);

            const gap = 20;
            const panelW = (WIDTH - 120) / 2;
            const panelH = panelW;
            const yOffset = 150;

            const leftPanelX = 40;
            const rightPanelX = 40 + panelW + gap;

            // Static Panels Background
            // Left
            ctx.save();
            ctx.translate(leftPanelX, yOffset);
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, panelW, panelH);
            ctx.fillStyle = '#cbd5e1'; ctx.font = '16px monospace'; ctx.fillText("ORIGINAL (ANNOTATED)", 0, -10);
            // Draw Faint Image Base
            ctx.globalAlpha = 1 - progress * 0.5; // Fade out slightly but keep context
            ctx.drawImage(imgRef.current, 0, 0, panelW, panelH);
            ctx.restore();

            // Right
            ctx.save();
            ctx.translate(rightPanelX, yOffset);
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, panelW, panelH);
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, panelW, panelH);
            ctx.fillStyle = '#cbd5e1'; ctx.textAlign = 'start'; ctx.font = '16px monospace'; ctx.fillText("ATLAS LAYOUT", 0, -10);
            ctx.restore();

            // ANIMATING PARTS (OUTLINES)
            if (analysisResults) {
                analysisResults.forEach((part, i) => {
                    if (!part.atlasRect) return;

                    // Interpolation setup
                    const ease = (t: number) => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                    const p = ease(progress);

                    // 1024-space coordinates
                    const srcRect = bboxToRect(part.bbox, 1024);
                    const dstRect = part.atlasRect;

                    // Centers in 1024-space
                    const srcCx = srcRect.x + srcRect.w / 2;
                    const srcCy = srcRect.y + srcRect.h / 2;
                    const dstCx = dstRect.x + dstRect.w / 2; // Assuming no rotation
                    const dstCy = dstRect.y + dstRect.h / 2;

                    // Interpolate Center Position (Global 1024 Space relative to respective panels)
                    // We need to map 1024 space to Panel space later.
                    // But first, where is the center relative to the "Image" (0,0)?
                    // srcCx is relative to Left Panel Image Origin.
                    // dstCx is relative to Right Panel Image Origin.
                    // We want to interpolate the "Visual Center on Screen".

                    // Visual Origins (Pixels)
                    const leftOriginX = leftPanelX;
                    const rightOriginX = rightPanelX; // 40 + panelW + gap
                    const commonOriginY = yOffset;

                    const scaleToPanel = panelW / 1024;

                    // Start Center (Pixels)
                    const startPxX = leftOriginX + srcCx * scaleToPanel;
                    const startPxY = commonOriginY + srcCy * scaleToPanel;

                    // End Center (Pixels)
                    const endPxX = rightOriginX + dstCx * scaleToPanel;
                    const endPxY = commonOriginY + dstCy * scaleToPanel;

                    // Current Center (Pixels)
                    const curPxX = startPxX + (endPxX - startPxX) * p;
                    const curPxY = startPxY + (endPxY - startPxY) * p;

                    // Scale Interpolation
                    // Check if there is a scale difference
                    // Use max dimension to determine scale? Or just width? Assuming uniform.
                    const startScale = 1.0;
                    const endScale = dstRect.w / srcRect.w;
                    const curScale = startScale + (endScale - startScale) * p;

                    // Draw
                    ctx.save();

                    // We use drawPrimitive which draws shape at 0..1 coords scaled by 'size'.
                    // We want the shape to be centered at (curPxX, curPxY).
                    // Center of shape in 0..1 coords is (srcCx / 1024, srcCy / 1024).

                    const shapeCenterNormX = srcCx / 1024;
                    const shapeCenterNormY = srcCy / 1024;

                    const drawSize = panelW * curScale; // The effective size to pass to drawPrimitive

                    // Calculate where to place the Context Origin so that Shape Center lands on CurPx
                    // drawPrimitive draws at (shapeCenterNorm * drawSize).
                    // We want (Origin + shapeCenterNorm * drawSize) = CurPx.
                    // Origin = CurPx - shapeCenterNorm * drawSize.

                    const originX = curPxX - shapeCenterNormX * drawSize;
                    const originY = curPxY - shapeCenterNormY * drawSize;

                    ctx.translate(originX, originY);

                    // Styles
                    ctx.strokeStyle = `hsl(${i * 60}, 70%, 50%)`;
                    ctx.lineWidth = 3; // Fixed width or scaled? Fixed looks better for outline.
                    ctx.fillStyle = `hsla(${i * 60}, 70%, 50%, 0.3)`;
                    ctx.shadowColor = `hsl(${i * 60}, 70%, 50%)`;
                    ctx.shadowBlur = 10 * p;

                    drawPrimitive(ctx, part.shape, drawSize);

                    // Number
                    // Center is curPx.
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = "#fff";
                    ctx.font = 'bold 20px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    // Reset transform to draw text at simpler coords? Or just use inverse logic?
                    // easier to just use CurPx but we need to untranslate or just calculate local offset?
                    // Local offset for text at (CurPx) relative to (Origin) is (CurPx - Origin).
                    // Which is (shapeCenterNorm * drawSize).

                    const textX = shapeCenterNormX * drawSize;
                    const textY = shapeCenterNormY * drawSize;

                    if (progress > 0.1 && progress < 0.9) ctx.fillText(`${i + 1}`, textX, textY);

                    ctx.restore();
                });
            }
        }

        // --- Scene 6: Atlas Gen (Diffusion Fade) ---
        else if (t < T_INTRO + T_DIRECTOR + T_WORKERS + T_ARCHITECT + T_ATLAS_PREP + T_ATLAS_GEN) {
            const localT = t - (T_INTRO + T_DIRECTOR + T_WORKERS + T_ARCHITECT + T_ATLAS_PREP);

            ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, WIDTH, HEIGHT);

            const gap = 20;
            const panelW = (WIDTH - 120) / 2;
            const panelH = panelW;
            const yOffset = 150;

            // Left Panel (Empty now or faded)
            ctx.save();
            ctx.translate(40, yOffset);
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, panelW, panelH);
            ctx.restore();

            // Right Panel: Transitioning
            ctx.save();
            ctx.translate(40 + panelW + gap, yOffset);

            // 1. Draw Layout Base (White)
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, panelW, panelH);

            // 2. Draw PARTS as placeholders first (the end state of previous scene)
            if (analysisResults) {
                const scale = panelW / 1024;
                analysisResults.forEach(p => {
                    if (p.atlasRect) {
                        const r = p.atlasRect;
                        // Draw original image part as base?
                        // User wants "Interpolation ... AND AFTER diffusion ... interpolation to rig".
                        // So diffusion replaces the "Cutout from Original" with "Generated Texture".

                        // Draw Cutout (Fading Out?)
                        // Or Draw Cutout staying there, and Diffusion covers it.
                        const ir = bboxToRect(p.bbox, 1024);
                        // ctx.drawImage(imgRef.current, ir.x, ir.y, ir.w, ir.h, r.x*scale, r.y*scale, r.w*scale, r.h*scale);
                        // Actually, let's keep the layout placeholders or cutouts visible?
                        // Let's just draw the diffusion over.
                    }
                });
            }

            // 3. Draw Generated Atlas with Pixel Diffusion
            if (atlasImgRef.current.complete) {
                const progress = localT / T_ATLAS_GEN;

                const gridSize = 64; // Performance optimization
                const blockW = panelW / gridSize;
                const blockH = panelH / gridSize;

                for (let y = 0; y < gridSize; y++) {
                    for (let x = 0; x < gridSize; x++) {
                        const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
                        const randomVal = seed - Math.floor(seed);

                        if (randomVal < progress) {
                            const sx = (x / gridSize) * 1024;
                            const sy = (y / gridSize) * 1024;
                            const sw = 1024 / gridSize;
                            const sh = 1024 / gridSize;
                            const dx = x * blockW;
                            const dy = y * blockH;

                            ctx.drawImage(atlasImgRef.current, sx, sy, sw, sh, dx, dy, blockW + 1, blockH + 1);
                        }
                    }
                }
            }

            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, panelW, panelH);

            ctx.fillStyle = '#4ade80';
            ctx.fillText("DIFFUSING PIXELS...", 0, -10);
            ctx.restore();
        }

        // --- Scene 7: Assembly (Interpolation: Atlas -> Rig) ---
        else if (t < T_INTRO + T_DIRECTOR + T_WORKERS + T_ARCHITECT + T_ATLAS_PREP + T_ATLAS_GEN + T_ASSEMBLY) {
            const localT = t - (T_INTRO + T_DIRECTOR + T_WORKERS + T_ARCHITECT + T_ATLAS_PREP + T_ATLAS_GEN);
            const progress = Math.min(1, localT / T_ASSEMBLY);
            const ease = (t: number) => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            const p = ease(progress);

            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
            ctx.fillStyle = '#22d3ee';
            ctx.font = 'bold 40px monospace';
            ctx.fillText("> N-SPRITE: ASSEMBLING RIG...", 40, 60);

            if (analysisResults && atlasImgRef.current.complete) {
                // We need to interpolate GLOBAL Transform of each part.
                // Source: Atlas Position (Right Panel Coords -> Global)
                // Target: Rig Position (Center Screen -> Global)

                // To compute Target Rig Position efficiently, we can use the same hierarchy logic 
                // but setting animation time to 0 (T-pose/Rest pose).

                // NOTE: Computing global transform for hierarchy is complex inside a loop.
                // Simplified approach: Calculate "Rest Pose" Global Transforms ideally once.
                // Here we redo it.

                const gap = 20;
                const panelW = (WIDTH - 120) / 2;
                const yOffset = 150;
                const atlasScale = panelW / 1024;

                // We need to traverse hierarchy to find Global Target Transforms.
                const roots = buildTree(analysisResults);

                // Helper to get global state
                const getRigState = (node: TreeNode, parentX: number = 0, parentY: number = 0): { id: string, x: number, y: number, rot: number, scale: number }[] => {
                    const { part } = node;

                    // Rest Pose Logic (from Final Animation scene)
                    let relX = 0, relY = 0;
                    if (part.parentId) {
                        const parent = analysisResults.find(p => p.id === part.parentId)!;
                        relX = (part.pivot.x - parent.pivot.x) * WIDTH;
                        relY = (part.pivot.y - parent.pivot.y) * WIDTH;
                    } else {
                        relX = (part.pivot.x - 0.5) * WIDTH;
                        relY = (part.pivot.y - 0.5) * WIDTH;
                        // Account for Center translation:
                        relX += WIDTH / 2;
                        relY += HEIGHT / 2;
                    }

                    // If it's a child, add parent pos (assuming simplified translation-only hierarchy for pivot calc? 
                    // Wait, Rotation affects children pivots. 
                    // To do this strictly correct requires matrices.
                    // Approximation: The "Final Animation" loop does `ctx.translate` recursively.
                    // We can't really LERP matrix stacks easily.
                    // ALTERNATIVE: Visually fly from "Source Rect Center" to "Target Rect Center".
                    // We can compute Target Center by "dry running" the draw logic for the Rig.

                    // For now, let's just assume we animate Position. Rotation/Scale might snap or just fade.
                    // Actually, let's assume T-Pose has 0 rotation for all parts relative to parent?
                    // Visualizer logic just stacks transforms.

                    // Let's cheat. 
                    // We draw the Rig at opacity 'p', and the Atlas at opacity '1-p' moving towards it?
                    // No, user wants moving pieces.

                    // Let's compute global target for each part by running the hierarchy transform logic mentally.
                    // Better: Just use a simplified target. 
                    // Most parts are unique.
                    return [];
                };

                // We will do a recursive drawing pass that interpolates the MATRIX state!
                // Start at Panel Position, End at Rig Position.
                // But hierarchy implies dependence. 
                // If we interpolate Local Transforms, the hierarchy will swing wildly.
                // We need to interpolate Global Transforms.
                // This means we treat every part as a root during interpolation, flying to its final spot.

                // 1. Calculate Target Global Transform for every part (Rest Pose)
                const targets = new Map<string, { x: number, y: number, scale: number }>();

                const computeTargets = (node: TreeNode, currentMatrix: DOMMatrix) => {
                    const { part } = node;
                    let m = currentMatrix;

                    // Apply Rig Hierarchy Transforms (Rest Pose)
                    let relX = 0, relY = 0;
                    if (part.parentId) {
                        const parent = analysisResults.find(p => p.id === part.parentId)!;
                        relX = (part.pivot.x - parent.pivot.x) * WIDTH;
                        relY = (part.pivot.y - parent.pivot.y) * WIDTH;
                    } else {
                        relX = (part.pivot.x - 0.5) * WIDTH;
                        relY = (part.pivot.y - 0.5) * WIDTH;

                        // Root is centered globally
                        m = m.translate(WIDTH / 2, HEIGHT / 2);
                    }
                    m = m.translate(relX, relY);
                    // No anim rotation/scale/translation for rest pose

                    // The "Image" (part) is drawn at (bbox.x - pivotPx) relative to this M.
                    // We want the center of the image part? Or just the M origin (Pivot)?
                    // Let's store the M.

                    // Visualizer draws image at: drawX = bbox.x - pivotX, drawY = bbox.y - pivotY
                    // Global Image Pos = M * (drawX, drawY)
                    const bbox = bboxToRect(part.bbox, WIDTH);
                    const pivotPxX = part.pivot.x * WIDTH;
                    const pivotPxY = part.pivot.y * WIDTH;
                    const localImgX = bbox.x - pivotPxX;
                    const localImgY = bbox.y - pivotPxY;

                    const finalPt = m.transformPoint(new DOMPoint(localImgX, localImgY));
                    targets.set(part.id, { x: finalPt.x, y: finalPt.y, scale: 1.0 }); // Rig scale is 1.0

                    node.children.forEach(c => computeTargets(c, m));
                };

                computeTargets(roots[0], new DOMMatrix()); // Assuming single root for simplicity

                // 2. Draw Parts Interpolated
                // We iterate flat list this time, ignoring hierarchy, just drawing quads at interpolated spots.
                analysisResults.forEach(part => {
                    if (!part.atlasRect) return;
                    const target = targets.get(part.id);
                    if (!target) return; // Should allow multi-root but helper assumed 1

                    // Source Global (Atlas Panel)
                    const r = part.atlasRect;
                    const srcX = (40 + panelW + gap) + (r.x * atlasScale);
                    const srcY = yOffset + (r.y * atlasScale);
                    const srcScale = atlasScale;

                    // Interpolate
                    const curX = srcX + (target.x - srcX) * p;
                    const curY = srcY + (target.y - srcY) * p;
                    const curScale = srcScale + (target.scale - srcScale) * p;

                    // Draw
                    // We need to scale the width/height of the part too
                    const bbox = bboxToRect(part.bbox, WIDTH); // Target Size (Scale 1)

                    const curW = bbox.w * curScale;
                    const curH = bbox.h * curScale;

                    ctx.drawImage(
                        atlasImgRef.current,
                        r.x, r.y, r.w, r.h, // Source from Atlas Texture
                        curX, curY, curW, curH // Dest interpolated
                    );
                });
            }
        }

        // --- Scene 8: Final Animation (Live Rig) ---
        else {
            const localT = t - (T_INTRO + T_DIRECTOR + T_WORKERS + T_ARCHITECT + T_ATLAS_PREP + T_ATLAS_GEN + T_ASSEMBLY);

            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            ctx.fillStyle = '#22d3ee';
            ctx.font = 'bold 40px monospace';
            ctx.textAlign = 'left';
            ctx.fillText("> N-SPRITE: FINAL ASSET LIVE PREVIEW", 40, 60);

            if (analysisResults && atlasImgRef.current.complete) {
                const roots = buildTree(analysisResults);

                const drawNode = (node: TreeNode) => {
                    const { part } = node;

                    let animRot = 0, animX = 0, animY = 0, animScale = 1;
                    const animTime = localT;

                    switch (part.movementType) {
                        case MovementType.ROTATION:
                            animRot = Math.sin(animTime * 3) * 0.25;
                            break;
                        case MovementType.SLIDING:
                            animX = Math.sin(animTime * 4) * 10;
                            animY = Math.sin(animTime * 4 + 0.5) * 5;
                            break;
                        case MovementType.ELASTIC:
                            animScale = 1 + Math.sin(animTime * 5) * 0.05;
                            break;
                    }

                    ctx.save();

                    let relX = 0, relY = 0;
                    if (part.parentId) {
                        const parent = analysisResults.find(p => p.id === part.parentId)!;
                        relX = (part.pivot.x - parent.pivot.x) * WIDTH;
                        relY = (part.pivot.y - parent.pivot.y) * WIDTH;
                    } else {
                        relX = (part.pivot.x - 0.5) * WIDTH;
                        relY = (part.pivot.y - 0.5) * WIDTH;
                        ctx.translate(WIDTH / 2, HEIGHT / 2);
                    }

                    ctx.translate(relX, relY);
                    ctx.translate(animX, animY);
                    ctx.rotate(animRot);
                    ctx.scale(animScale, animScale);

                    if (part.atlasRect) {
                        const bbox = bboxToRect(part.bbox, WIDTH);
                        const pivotPxX = part.pivot.x * WIDTH;
                        const pivotPxY = part.pivot.y * WIDTH;

                        const drawX = bbox.x - pivotPxX;
                        const drawY = bbox.y - pivotPxY;

                        const src = part.atlasRect;
                        ctx.drawImage(
                            atlasImgRef.current,
                            src.x, src.y, src.w, src.h,
                            drawX, drawY, bbox.w, bbox.h
                        );
                    }

                    // Draw Children
                    node.children.forEach(child => drawNode(child));

                    ctx.restore();
                };

                roots.forEach(root => drawNode(root));
            }

            // Overlay Final text
            if (localT > 1) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(0, HEIGHT - 100, WIDTH, 100);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 40px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText("N-SPRITE v1.0", WIDTH - 40, HEIGHT - 35);
            }
        }


    };

    // Helper to draw primitive (copied/adapted from canvasUtils for now)
    const drawPrimitive = (ctx: CanvasRenderingContext2D, shape: SVGPrimitive, size: number) => {
        ctx.beginPath();
        switch (shape.type) {
            case 'circle':
                ctx.arc(shape.cx * size, shape.cy * size, shape.r * size, 0, Math.PI * 2);
                break;
            case 'rect':
                ctx.rect(shape.x * size, shape.y * size, shape.width * size, shape.height * size);
                break;
            case 'ellipse':
                ctx.ellipse(shape.cx * size, shape.cy * size, shape.rx * size, shape.ry * size, 0, 0, Math.PI * 2);
                break;
            case 'path':
                ctx.save();
                ctx.scale(size, size);
                ctx.lineWidth = ctx.lineWidth / size; // Fix: Scale down line width
                const p = new Path2D(shape.d);
                ctx.stroke(p);
                ctx.restore();
                return;
        }
        ctx.stroke();
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur flex items-center justify-center p-8">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-w-6xl w-full max-h-[90vh] overflow-hidden">

                {/* Header */}
                <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                            <Video className="w-5 h-5" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">Pipeline Video Export</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex gap-6 p-6 min-h-0">
                    {/* Preview Canvas */}
                    <div className="aspect-square h-full bg-slate-950 rounded-lg border border-slate-800 relative shadow-inner flex items-center justify-center">
                        <canvas
                            ref={canvasRef}
                            width={WIDTH}
                            height={HEIGHT}
                            className="max-h-full max-w-full rounded shadow-lg object-contain"
                        />
                        {!isRecording && status === 'Ready' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                                <button
                                    onClick={startRecording}
                                    className="group relative px-8 py-4 bg-white text-slate-900 rounded-full font-bold text-lg shadow-xl hover:scale-105 transition-transform flex items-center gap-3"
                                >
                                    <Play className="w-6 h-6 fill-slate-900" />
                                    Start Recording
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Controls */}
                    <div className="w-80 flex flex-col gap-6">
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-slate-400">Status</h4>
                            <div className="text-2xl font-mono text-white">{status}</div>

                            {isRecording && (
                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                                    <div
                                        className="h-full bg-indigo-500 transition-all duration-100 ease-linear"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 space-y-4">
                            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                                <Download className="w-4 h-4 text-emerald-400" /> Export Settings
                            </h4>
                            <div className="space-y-2 text-sm text-slate-400">
                                <div className="flex justify-between">
                                    <span>Format</span>
                                    <span className="text-white">WebM (VP9)</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Resolution</span>
                                    <span className="text-white">1024x1024</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>FPS</span>
                                    <span className="text-white">30</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Duration</span>
                                    <span className="text-white">~{Math.ceil(TOTAL_DURATION)}s</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto text-xs text-slate-500">
                            <p>Records a client-side animation of the analysis process. No server GPU usage.</p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
