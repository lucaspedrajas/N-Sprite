import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Group, Image as KonvaImage, Circle, Rect as KonvaRect, Line, Ellipse, Path } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { GamePart, MovementType, bboxToRect, relToPixel } from '../types';
import { useSceneGraph, TreeNode } from '../hooks/useSceneGraph';
import { clampRel, clampBbox, applyClipPath, scalePathData } from '../utils/visualizerUtils';
import { loadImage } from '../utils/canvasUtils';
import { Play, Pause, ZoomIn, ZoomOut, CheckCircle, RotateCcw, Box, Layers, Maximize } from 'lucide-react';

interface VisualizerProps {
    parts: GamePart[];
    originalImageBase64?: string; // For Rig mode
    atlasBase64?: string; // For Atlas mode
    mode: 'rig' | 'atlas';
    width?: number;
    height?: number;
    onConfirm?: () => void;
    onRetry?: () => void;
}

const SCALE_FACTOR = 0.5; // Default visual scale

export const Visualizer2D: React.FC<VisualizerProps> = ({
    parts,
    originalImageBase64,
    atlasBase64,
    mode,
    width = 600,
    height = 450,
    onConfirm,
    onRetry
}) => {
    const { tree } = useSceneGraph(parts);
    const [image, setImage] = useState<HTMLImageElement | null>(null);

    // Viewport State
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Animation State
    const [isPlaying, setIsPlaying] = useState(true);
    const [time, setTime] = useState(0);
    const requestRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(Date.now());
    const [showWireframe, setShowWireframe] = useState(mode === 'rig');
    const [showBBoxes, setShowBBoxes] = useState(false);

    // Load Image
    useEffect(() => {
        const src = mode === 'rig' && originalImageBase64
            ? `data:image/png;base64,${originalImageBase64}`
            : atlasBase64
                ? `data:image/png;base64,${atlasBase64}`
                : null;

        if (src) {
            loadImage(src).then(setImage);
        }
    }, [originalImageBase64, atlasBase64, mode]);

    // Animation Loop
    useEffect(() => {
        const animate = () => {
            if (isPlaying) {
                // Use a functional update or ref to avoid stale closure if we were doing complex logic
                // But here we just want a monotonic time source
                const now = Date.now();
                setTime((now - startTimeRef.current) / 1000);
            }
            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isPlaying]);

    // Center Stage Initially
    useEffect(() => {
        if (containerRef.current) {
            setStagePos({ x: width / 2, y: height / 2 });
        }
    }, [width, height]);


    const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const scaleBy = 1.1;
        const oldScale = stageScale;
        const pointer = e.target.getStage()?.getPointerPosition();

        if (!pointer) return;

        const mousePointTo = {
            x: (pointer.x - stagePos.x) / oldScale,
            y: (pointer.y - stagePos.y) / oldScale,
        };

        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

        setStagePos({
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        });
        setStageScale(newScale);
    };

    if (!image) return <div className="flex items-center justify-center h-64 text-slate-500">Loading Assets...</div>;

    const imgSize = image.width; // Assuming square for base



    // Component to render the actual vector shape outline
    const VectorShape = ({ part, width, height }: { part: GamePart, width: number, height: number }) => {
        const { shape } = part;
        const color = "#06b6d4"; // Cyan
        const strokWidth = 1.5;

        switch (shape.type) {
            case 'circle': {
                const cx = clampRel(shape.cx) * width;
                const cy = clampRel(shape.cy) * height;
                const r = Math.max(1, clampRel(shape.r) * width);
                return <Circle x={cx} y={cy} radius={r} stroke={color} strokeWidth={strokWidth} />;
            }
            case 'ellipse': {
                const cx = clampRel(shape.cx) * width;
                const cy = clampRel(shape.cy) * height;
                const rx = Math.max(1, clampRel(shape.rx) * width);
                const ry = Math.max(1, clampRel(shape.ry) * height);
                return <Ellipse x={cx} y={cy} radiusX={rx} radiusY={ry} stroke={color} strokeWidth={strokWidth} />;
            }
            case 'rect': {
                const x = clampRel(shape.x) * width;
                const y = clampRel(shape.y) * height;
                const w = Math.max(1, clampRel(shape.width) * width);
                const h = Math.max(1, clampRel(shape.height) * height);
                return <KonvaRect x={x} y={y} width={w} height={h} stroke={color} strokeWidth={strokWidth} cornerRadius={shape.rx ? clampRel(shape.rx) * width : 0} />;
            }
            case 'path': {
                // Use native Konva scaling to avoid string parsing issues with arcs
                return (
                    <Path
                        data={shape.d}
                        stroke={color}
                        strokeWidth={strokWidth}
                        scaleX={width}
                        scaleY={height}
                        strokeScaleEnabled={false} // Prevent stroke from getting huge
                    />
                );
            }
            default:
                return null;
        }
    };

    // Refactored Recursive Component to support Hook usage properly
    const RecursivePart = ({ node, parentPivotPx }: { node: TreeNode, parentPivotPx: { x: number, y: number } | null }) => {
        const { part } = node;
        const anim = useMemo(() => {
            let rotation = 0, x = 0, y = 0, scale = 1;
            if (isPlaying && (mode === 'rig' || mode === 'atlas')) {
                switch (part.movementType) {
                    case MovementType.ROTATION:
                        rotation = Math.sin(time * 3) * 15;
                        break;
                    case MovementType.SLIDING:
                        x = Math.sin(time * 4) * 10;
                        y = Math.sin(time * 4 + 0.5) * 5;
                        break;
                    case MovementType.ELASTIC:
                        scale = 1 + Math.sin(time * 5) * 0.05;
                        break;
                }
            }
            return { rotation, x, y, scale };
        }, [part.movementType, time, isPlaying, mode]);

        const geom = useMemo(() => {
            const bounds = bboxToRect(clampBbox(part.bbox), imgSize);
            const pivotPx = {
                x: clampRel(part.pivot.x) * imgSize,
                y: clampRel(part.pivot.y) * imgSize
            };
            return { bounds, pivotPx };
        }, [part, imgSize]);

        // Position Calculation
        let xPos, yPos;
        if (parentPivotPx) {
            xPos = geom.pivotPx.x - parentPivotPx.x;
            yPos = geom.pivotPx.y - parentPivotPx.y;
        } else {
            const center = imgSize / 2;
            xPos = geom.pivotPx.x - center;
            yPos = geom.pivotPx.y - center;
        }

        return (
            <Group
                x={xPos + anim.x}
                y={yPos + anim.y}
                rotation={anim.rotation}
                scaleX={anim.scale}
                scaleY={anim.scale}
            >
                {/* Visuals */}
                <Group
                    clipFunc={mode === 'rig' ? (ctx: any) => {
                        ctx.translate(-geom.pivotPx.x, -geom.pivotPx.y);
                        applyClipPath(ctx, part.shape, imgSize);
                        ctx.translate(geom.pivotPx.x, geom.pivotPx.y);
                    } : undefined}
                >
                    {mode === 'rig' ? (
                        <KonvaImage
                            image={image}
                            x={-geom.pivotPx.x}
                            y={-geom.pivotPx.y}
                            width={imgSize}
                            height={imgSize}
                            opacity={1} // Ensure full opacity
                        />
                    ) : (
                        // Atlas Mode
                        node.part.atlasRect && (
                            <KonvaImage
                                image={image}
                                crop={{
                                    x: node.part.atlasRect.x,
                                    y: node.part.atlasRect.y,
                                    width: node.part.atlasRect.w,
                                    height: node.part.atlasRect.h
                                }}
                                x={geom.bounds.x - geom.pivotPx.x}
                                y={geom.bounds.y - geom.pivotPx.y}
                                width={geom.bounds.w}
                                height={geom.bounds.h}
                            />
                        )
                    )}
                </Group>

                {/* Vector Shape Outline (Sibling to clip group, so it is NOT clipped) */}
                {mode === 'rig' && (
                    <Group x={-geom.pivotPx.x} y={-geom.pivotPx.y}>
                        {/* We use width/height of the original image space for vectors */}
                        <VectorShape part={part} width={imgSize} height={imgSize} />
                    </Group>
                )}

                {/* Vector Shape Outline (Sibling to clip group, so it is NOT clipped) */}
                {mode === 'rig' && (
                    <Group x={-geom.pivotPx.x} y={-geom.pivotPx.y}>
                        {/* We use width/height of the original image space for vectors */}
                        <VectorShape part={part} width={imgSize} height={imgSize} />
                    </Group>
                )}

                {/* Debug Visuals */}
                {(showWireframe) && (
                    <Group>
                        <Circle radius={3} fill="#ef4444" />
                        {showBBoxes && <KonvaRect x={geom.bounds.x - geom.pivotPx.x} y={geom.bounds.y - geom.pivotPx.y} width={geom.bounds.w} height={geom.bounds.h} stroke="yellow" strokeWidth={1} dash={[2, 2]} />}
                    </Group>
                )}

                {/* Children */}
                {node.children.map(child => (
                    <RecursivePart key={child.part.id} node={child} parentPivotPx={geom.pivotPx} />
                ))}
            </Group>
        );
    };


    return (
        <div className="flex flex-col gap-2 bg-slate-900 rounded-lg p-2 border border-slate-700" ref={containerRef}>
            <div className="relative overflow-hidden bg-black/50 rounded border border-slate-700 h-[500px]">
                <Stage
                    width={width}
                    height={500}
                    onWheel={handleWheel}
                    scaleX={stageScale}
                    scaleY={stageScale}
                    x={stagePos.x}
                    y={stagePos.y}
                    draggable
                    onDragEnd={(e) => {
                        setStagePos(e.target.position());
                    }}
                >
                    <Layer>
                        {/* Grid / Background */}
                        <Group>
                            {/* Ideally a grid pattern, simplified here */}
                        </Group>

                        {/* Root Parts */}
                        {tree.map(root => (
                            <RecursivePart key={root.part.id} node={root} parentPivotPx={null} />
                        ))}
                    </Layer>
                </Stage>

                {/* Overlay Controls */}
                <div className="absolute top-4 right-4 flex flex-col gap-2">
                    <button onClick={() => setStageScale(s => s * 1.2)} className="p-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700"><ZoomIn size={16} /></button>
                    <button onClick={() => setStageScale(s => s / 1.2)} className="p-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700"><ZoomOut size={16} /></button>
                    <button onClick={() => { setStageScale(1); setStagePos({ x: width / 2, y: 250 }); }} className="p-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700"><Maximize size={16} /></button>
                </div>

                <div className="absolute bottom-4 left-4 flex gap-2">
                    <button onClick={() => setIsPlaying(!isPlaying)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-500 shadow-lg">
                        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                        <span className="text-xs font-bold">{isPlaying ? 'PAUSE' : 'PLAY'}</span>
                    </button>
                    <button onClick={() => setTime(0)} className="p-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 shadow-lg">
                        <RotateCcw size={16} />
                    </button>
                </div>

                <div className="absolute bottom-4 right-4 flex gap-2">
                    <button onClick={() => setShowWireframe(!showWireframe)} className={`p-2 rounded shadow-lg ${showWireframe ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                        <Box size={16} />
                    </button>
                    <button onClick={() => setShowBBoxes(!showBBoxes)} className={`p-2 rounded shadow-lg ${showBBoxes ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                        <Layers size={16} />
                    </button>
                </div>
            </div>

            {/* Action Bar */}
            {(onConfirm || onRetry) && (
                <div className="flex justify-between items-center p-2">
                    {onRetry && (
                        <button onClick={onRetry} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                            Re-Analyze
                        </button>
                    )}
                    {onConfirm && (
                        <button onClick={onConfirm} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium">
                            <CheckCircle size={18} />
                            Confirm & Continue
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
