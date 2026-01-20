import React from 'react';
import { GitBranch } from 'lucide-react';
import { GamePart, PipelineDebugData, AppState, StreamState } from '../types';
import { Visualizer2D } from './Visualizer2D';
import { SceneDataInspector } from './SceneDataInspector';
import { StageControls } from './StageControls';

interface ArchitectStepProps {
    analysisResults: GamePart[] | null;
    originalImage: string | null;
    isAnalyzing: boolean;
    streamState: StreamState;
    onConfirm: () => void;
    onRetryFresh: () => Promise<void>;
    onRetryWithFeedback: (feedback: string) => Promise<void>;
}

export const ArchitectStep: React.FC<ArchitectStepProps> = ({
    analysisResults,
    originalImage,
    isAnalyzing,
    streamState,
    onConfirm,
    onRetryFresh,
    onRetryWithFeedback
}) => {
    return (
        <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300"><GitBranch className="w-5 h-5" /></div>
                <h2 className="text-lg font-semibold text-white">Rigging Architect</h2>
                {analysisResults && <span className="text-xs text-emerald-400 ml-auto">✓ {analysisResults.length} parts rigged</span>}
            </div>

            <div className="flex-1">
                {isAnalyzing && streamState.currentStage === 'architect' && (
                    <div className="flex flex-col items-center py-6 gap-3 bg-slate-800/50 rounded-lg mb-4">
                        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-slate-400 text-sm animate-pulse">{streamState.stageMessage || 'Building rig hierarchy...'}</p>
                        {streamState.thinkingText && (
                            <div className="w-full max-w-md h-24 overflow-hidden relative mt-2 bg-black/20 rounded p-2 border border-slate-700/50">
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 to-transparent pointer-events-none" />
                                <p className="text-[10px] font-mono text-emerald-500/50 whitespace-pre-wrap font-xs">
                                    {streamState.thinkingText.slice(-300)}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Show content if we have results OR if we are re-analyzing (keep stale results visible but dimmed) */}
                {analysisResults && (
                    <div className={`space-y-4 ${isAnalyzing ? 'opacity-50 pointer-events-none' : ''}`}>
                        {/* New Consolidated View: Visualizer + Inspector */}
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[600px]">
                            {/* Left: Interactive Visualizer (3/4 width) */}
                            <div className="bg-slate-900 rounded-lg p-3 border border-slate-700 flex flex-col lg:col-span-3">
                                <h4 className="text-xs font-medium text-slate-400 uppercase mb-2">Rig Simulation</h4>
                                <div className="flex-1 min-h-0">
                                    <Visualizer2D
                                        parts={analysisResults}
                                        originalImageBase64={originalImage || undefined}
                                        mode="rig"
                                        width={800} // Will need to be responsive or fit container
                                        height={600}
                                    />
                                </div>
                            </div>

                            {/* Right: Data Inspector (1/4 width) */}
                            <div className="bg-slate-900 rounded-lg p-3 border border-slate-700 flex flex-col min-h-0 lg:col-span-1">
                                <SceneDataInspector parts={analysisResults} />
                            </div>
                        </div>

                        <StageControls
                            onConfirm={onConfirm}
                            onRetryFresh={onRetryFresh}
                            onRetryWithFeedback={onRetryWithFeedback}
                            confirmLabel="Confirm Rig → Atlas"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
