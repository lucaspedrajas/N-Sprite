import React from 'react';
import { Layers } from 'lucide-react';
import { PipelineDebugData, StreamState, SegmentationMode } from '../types';
import { StageControls } from './StageControls';

interface DirectorStepProps {
    imageBase64: string | null;
    debugData: PipelineDebugData | null;
    isAnalyzing: boolean;
    streamState: StreamState;
    onConfirm: () => void;
    onRetryFresh: () => Promise<void>;
    onRetryWithFeedback: (feedback: string) => Promise<void>;
    segmentationMethod: SegmentationMode;
    onMethodChange: (method: SegmentationMode) => void;
}

export const DirectorStep: React.FC<DirectorStepProps> = ({
    imageBase64,
    debugData,
    isAnalyzing,
    streamState,
    onConfirm,
    onRetryFresh,
    onRetryWithFeedback,
    segmentationMethod,
    onMethodChange
}) => {
    return (
        <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-violet-500/20 text-violet-300"><Layers className="w-5 h-5" /></div>
                <h2 className="text-lg font-semibold text-white">Director - Part Discovery</h2>
                {debugData?.directorOutput && <span className="text-xs text-emerald-400 ml-auto">✓ Found {debugData.directorOutput.length} parts</span>}
            </div>

            <div className="flex-1">
                {/* Loading State */}
                {isAnalyzing && streamState.currentStage === 'director' && (
                    <div className="flex flex-col items-center py-6 gap-3 bg-slate-800/50 rounded-lg mb-4">
                        <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-slate-400 text-sm animate-pulse">{streamState.stageMessage || 'Analyzing image structure...'}</p>
                    </div>
                )}

                {/* Content - keep visible during re-analysis if we have data */}
                {debugData?.directorOutput && (
                    <div className={`space-y-4 ${isAnalyzing ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="flex gap-4">
                            {/* Original with Overlay */}
                            <div className="relative">
                                <img
                                    src={`data:image/png;base64,${imageBase64}`}
                                    alt="Analysis"
                                    className="w-64 h-64 object-contain rounded-lg border border-slate-600 bg-slate-900"
                                />
                                {/* Overlay anchors */}
                                <svg className="absolute inset-0 w-64 h-64 pointer-events-none">
                                    {debugData.directorOutput.map((manifest, i) => {
                                        const x = manifest.visual_anchor[0] * 256; // Assuming 256x256 display size
                                        const y = manifest.visual_anchor[1] * 256;
                                        const color = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'][i % 8];
                                        return (
                                            <g key={manifest.id}>
                                                {/* Bounding Box */}
                                                {manifest.bbox && (
                                                    <rect
                                                        x={manifest.bbox[0] * 256}
                                                        y={manifest.bbox[1] * 256}
                                                        width={(manifest.bbox[2] - manifest.bbox[0]) * 256}
                                                        height={(manifest.bbox[3] - manifest.bbox[1]) * 256}
                                                        fill="none"
                                                        stroke={color}
                                                        strokeWidth="1"
                                                        strokeDasharray="4 2"
                                                        opacity="0.6"
                                                    />
                                                )}
                                                <circle cx={x} cy={y} r="8" fill={color} opacity="0.8" />
                                                <circle cx={x} cy={y} r="4" fill="white" />
                                                <line x1={x - 12} y1={y} x2={x + 12} y2={y} stroke={color} strokeWidth="2" />
                                                <line x1={x} y1={y - 12} x2={x} y2={y + 12} stroke={color} strokeWidth="2" />
                                                <text x={x + 12} y={y - 8} fill={color} fontSize="10" fontWeight="bold">{i + 1}</text>
                                            </g>
                                        );
                                    })}
                                </svg>
                            </div>

                            {/* Part list */}
                            <div className="flex-1 grid grid-cols-2 gap-2 max-h-64 overflow-y-auto custom-scrollbar">
                                {debugData.directorOutput.map((manifest, i) => (
                                    <div key={manifest.id} className="bg-slate-900 rounded-lg p-2 border border-slate-700 relative overflow-hidden">
                                        {/* Strategy Indicator */}
                                        <div className={`absolute top-0 right-0 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider ${manifest.segmentation_strategy === 'sam3' ? 'bg-violet-900/80 text-violet-200' : 'bg-indigo-900/80 text-indigo-200'
                                            }`}>
                                            {manifest.segmentation_strategy || 'GEMINI'}
                                        </div>

                                        <div className="flex items-center gap-2 mb-1 mt-2">
                                            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'][i % 8] }}>
                                                {i + 1}
                                            </div>
                                            <span className="text-sm font-medium text-white truncate">{manifest.name}</span>
                                        </div>
                                        <div className="text-xs text-slate-500">{manifest.type_hint}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Segmentation Method Selector */}
                        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700">
                            <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Segmentation Strategy</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onMethodChange('auto')}
                                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${segmentationMethod === 'auto'
                                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                                >
                                    Hybrid (Auto)
                                    <span className="block text-[10px] opacity-70 font-normal">Per-part selection</span>
                                </button>
                                <button
                                    onClick={() => onMethodChange('sam3')}
                                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${segmentationMethod === 'sam3'
                                        ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                                >
                                    Force SAM3
                                    <span className="block text-[10px] opacity-70 font-normal">All parts</span>
                                </button>
                                <button
                                    onClick={() => onMethodChange('gemini')}
                                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${segmentationMethod === 'gemini'
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                                >
                                    Force Gemini
                                    <span className="block text-[10px] opacity-70 font-normal">All parts</span>
                                </button>
                            </div>
                        </div>

                        <StageControls
                            onConfirm={onConfirm}
                            onRetryFresh={onRetryFresh}
                            onRetryWithFeedback={onRetryWithFeedback}
                            confirmLabel="Confirm Parts → Run Workers"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
