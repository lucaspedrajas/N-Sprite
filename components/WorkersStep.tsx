import React, { useRef, useEffect, useState } from 'react';
import {
  PipelineDebugData,
  PartManifest,
  WorkerGeometry,
  WorkerError,
  WorkerHistory,
  bboxToRect
} from '../types';
import { loadImage } from '../utils/canvasUtils';
import { Cpu, AlertTriangle, RefreshCw, XCircle, MessageSquare, RotateCcw } from 'lucide-react';
import { RetryOptions } from '../services/geminiService';
import { StageControls } from './StageControls';
import { StreamState } from '../types';
import { opacity } from 'html2canvas/dist/types/css/property-descriptors/opacity';

interface WorkersStepProps {
  imageBase64: string | null;
  debugData: PipelineDebugData | null;
  currentStage: string; // from streamState
  isAnalyzing: boolean;
  streamState: StreamState;
  onRetryWorker?: (manifestId: string, options: RetryOptions) => Promise<void>;
  onConfirm: () => void; // Go to Architect
  onRetryFresh: () => void; // Retry Step (Run Workers Again)
}

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#06b6d4'
];

// Clamp relative value to 0-1 range
const clampRel = (v: number): number => Math.max(0, Math.min(1, v));

// Individual worker canvas - shows ONE worker's output with retry option
const WorkerCanvas: React.FC<{
  imageBase64: string;
  geometry: WorkerGeometry;
  manifest: PartManifest | undefined;
  color: string;
  index: number;
  onRetry?: (options: RetryOptions) => void;
  isRetrying?: boolean;
  history?: WorkerHistory;
}> = ({ imageBase64, geometry, manifest, color, index, onRetry, isRetrying, history }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const render = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = await loadImage(`data:image/png;base64,${imageBase64}`);
      const size = 350;
      canvas.width = size;
      canvas.height = size;

      ctx.globalAlpha = 0.5;
      ctx.drawImage(img, 0, 0, size, size);
      ctx.globalAlpha = 1;

      // Draw bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      const rect = bboxToRect(geometry.bbox.map(clampRel) as [number, number, number, number], size);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.setLineDash([]);

      // Draw shape with proper scaling
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const shape = geometry.shape;
      switch (shape.type) {
        case 'circle': {
          const cx = clampRel(shape.cx) * size;
          const cy = clampRel(shape.cy) * size;
          const r = clampRel(shape.r) * size;
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          break;
        }
        case 'ellipse': {
          const cx = clampRel(shape.cx) * size;
          const cy = clampRel(shape.cy) * size;
          const rx = clampRel(shape.rx) * size;
          const ry = clampRel(shape.ry) * size;
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          break;
        }
        case 'rect': {
          const x = clampRel(shape.x) * size;
          const y = clampRel(shape.y) * size;
          const w = clampRel(shape.width) * size;
          const h = clampRel(shape.height) * size;
          ctx.rect(x, y, w, h);
          break;
        }
        case 'path': {
          // For paths, scale the context - path d values should be 0-1
          ctx.save();
          ctx.scale(size, size);
          ctx.lineWidth = 2 / size;
          try {
            const path = new Path2D(shape.d);
            ctx.stroke(path);
          } catch { }
          ctx.restore();
          return;
        }
      }
      ctx.stroke();
    };
    render();
  }, [imageBase64, geometry, color]);

  const handleFreshRetry = () => {
    onRetry?.({ mode: 'fresh' });
  };

  const handleConversationalRetry = () => {
    // Capture the canvas with the composited shape overlay
    let compositedImageBase64: string | undefined;
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      compositedImageBase64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    }

    onRetry?.({
      mode: 'conversational',
      userFeedback: feedback || undefined,
      previousResult: JSON.stringify(geometry, null, 2),
      compositedImage: compositedImageBase64
    });
    setFeedback('');
    setShowFeedback(false);
  };

  return (
    <div className="bg-slate-800 rounded-lg p-2 border border-slate-700 relative">
      {/* History Overlay */}
      {showHistory && history && (
        <div className="absolute inset-0 bg-slate-900/95 z-10 flex flex-col p-2 overflow-hidden rounded-lg">
          <div className="flex justify-between items-center mb-2 border-b border-slate-700 pb-1">
            <span className="text-xs font-bold text-white">Worker History</span>
            <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white"><XCircle className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
            {history.events.map((ev, i) => (
              <div key={i} className="text-[10px] p-2 bg-slate-800 rounded border border-slate-700">
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Turn {ev.turn}</span>
                  <span className="uppercase font-bold" style={{ color: ev.type === 'generation' ? '#22c55e' : '#3b82f6' }}>{ev.type}</span>
                </div>
                {ev.verdict && (
                  <div className={`font-bold mb-1 ${ev.verdict === 'GOOD' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    QA: {ev.verdict}
                  </div>
                )}
                {ev.feedback && <div className="text-slate-300 italic mb-1">"{ev.feedback}"</div>}
                {ev.compositeImageBase64 && (
                  <img src={`data:image/png;base64,${ev.compositeImageBase64}`} className="w-full rounded border border-slate-600 mt-1" alt="Turn Result" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-1">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-medium text-slate-300 truncate flex-1">{manifest?.name || geometry.id}</span>
        {history && history.events.length > 0 && (
          <button
            onClick={() => setShowHistory(true)}
            className="text-[10px] bg-slate-700 hover:bg-slate-600 px-1.5 py-0.5 rounded text-slate-300"
          >
            {history.events.length} Turns
          </button>
        )}
        <span className="text-xs text-slate-500">{Math.round(geometry.confidence * 100)}%</span>
        {onRetry && (
          <button
            onClick={() => setShowFeedback(!showFeedback)}
            disabled={isRetrying}
            className={`p-1 rounded ${isRetrying ? 'text-slate-600' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
            title="Retry this worker"
          >
            <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
      <canvas ref={canvasRef} className="w-full rounded border border-slate-600 bg-slate-900" />
      <div className="text-xs text-slate-500 mt-1">
        {geometry.shape.type} • {geometry.amodal_completed ? 'amodal' : 'visible'}
      </div>

      {showFeedback && onRetry && (
        <div className="mt-2 p-2 bg-slate-900 rounded border border-slate-600 space-y-2 relative z-20">
          <div className="flex gap-1">
            <button
              onClick={handleFreshRetry}
              disabled={isRetrying}
              className="px-2 py-1 text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Fresh
            </button>
          </div>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe improvement (e.g., 'shape too large', 'use path instead')..."
            className="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-slate-500 resize-none"
            rows={2}
          />
          <button
            onClick={handleConversationalRetry}
            disabled={isRetrying}
            className="w-full px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center justify-center gap-1"
          >
            <MessageSquare className="w-3 h-3" />
            Retry with Feedback
          </button>
        </div>
      )}
    </div>
  );
};

// Failed worker card with retry button (fresh retry only for failed workers)
const FailedWorkerCard: React.FC<{
  error: WorkerError;
  onRetry: (options: RetryOptions) => void;
  isRetrying: boolean;
}> = ({ error, onRetry, isRetrying }) => (
  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
    <div className="flex items-start gap-2">
      <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-red-300 truncate">{error.manifestName}</div>
        <div className="text-xs text-slate-500 font-mono truncate">{error.manifestId}</div>
        <div className="text-xs text-red-400/80 mt-1 line-clamp-2">{error.error}</div>
        {error.retryCount > 0 && (
          <div className="text-xs text-slate-500 mt-1">Retried {error.retryCount}x</div>
        )}
      </div>
      <button
        onClick={() => onRetry({ mode: 'fresh' })}
        disabled={isRetrying}
        className={`p-1.5 rounded transition-colors flex-shrink-0 ${isRetrying
          ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
          : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
          }`}
        title="Retry this worker"
      >
        <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
      </button>
    </div>
  </div>
);

export const WorkersStep: React.FC<WorkersStepProps> = ({
  imageBase64,
  debugData,
  currentStage,
  isAnalyzing,
  streamState,
  onRetryWorker,
  onConfirm,
  onRetryFresh
}) => {
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  if (!imageBase64) return null;

  const handleRetryWorker = async (manifestId: string, options: RetryOptions) => {
    if (!onRetryWorker) return;
    setRetryingIds(prev => new Set(prev).add(manifestId));
    try {
      await onRetryWorker(manifestId, options);
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev);
        next.delete(manifestId);
        return next;
      });
    }
  };


  return (
    <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300"><Cpu className="w-5 h-5" /></div>
        <h2 className="text-lg font-semibold text-white">Workers - Geometry Extraction</h2>
        {debugData?.workerOutputs && debugData.workerOutputs.length > 0 && (
          <span className="text-xs text-emerald-400 ml-auto">✓ {debugData.workerOutputs.length} geometries</span>
        )}
        {(debugData?.workerErrors?.length || 0) > 0 && (
          <span className="text-xs text-red-400">{debugData?.workerErrors?.length} failed</span>
        )}
      </div>

      <div className="flex-1">
        {/* Status / Loading Header */}
        {isAnalyzing && streamState.currentStage === 'workers' && (
          <div className="flex flex-col items-center py-6 gap-3 bg-slate-800/50 rounded-lg mb-4">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm animate-pulse">{streamState.stageMessage || 'Extracting geometries...'}</p>
          </div>
        )}

        {/* Content Area - Always render if we have data OR if we are analyzing (skeletons) */}
        <div className="space-y-4">

          {/* Show skeletal grid if analyzing and no results yet (prevents collapse/empty state) */}
          {isAnalyzing && (debugData?.workerOutputs?.length || 0) === 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-3 opacity-50">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="aspect-square bg-slate-700/50 rounded-lg animate-pulse border border-slate-700/50 flex items-center justify-center">
                  <div className="w-8 h-8 bg-slate-600 rounded-full" />
                </div>
              ))}
            </div>
          )}

          {/* Successful workers */}
          {(debugData?.workerOutputs?.length || 0) > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-3">
              {debugData?.workerOutputs?.map((geo, i) => {
                const manifest = debugData.directorOutput?.find(m => m.id === geo.id);
                const history = debugData.workerHistory?.find(h => h.manifestId === geo.id);
                return (
                  <WorkerCanvas
                    key={geo.id}
                    imageBase64={imageBase64}
                    geometry={geo}
                    manifest={manifest}
                    color={COLORS[i % COLORS.length]}
                    index={i}
                    onRetry={onRetryWorker ? (options) => handleRetryWorker(geo.id, options) : undefined}
                    isRetrying={retryingIds.has(geo.id)}
                    history={history}
                  />
                );
              })}
            </div>
          )}

          {/* Failed workers with retry */}
          {(debugData?.workerErrors?.length || 0) > 0 && (
            <div className="mt-3">
              <div className="text-xs text-red-400 uppercase font-bold mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Failed Workers - Click to retry
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {debugData?.workerErrors?.map(error => (
                  <FailedWorkerCard
                    key={error.manifestId}
                    error={error}
                    onRetry={(options) => handleRetryWorker(error.manifestId, options)}
                    isRetrying={retryingIds.has(error.manifestId)}
                  />
                ))}
              </div>
            </div>
          )}

          {!isAnalyzing && (debugData?.workerOutputs?.length || 0) > 0 && (
            <StageControls
              onConfirm={onConfirm}
              onRetryFresh={onRetryFresh}
              confirmLabel="Confirm Geometries → Run Architect"
            />
          )}
        </div>
      </div>
    </div>
  );
};
