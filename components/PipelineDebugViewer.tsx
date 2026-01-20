import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  PipelineDebugData, 
  PartManifest, 
  WorkerGeometry, 
  WorkerError,
  GamePart,
  APICallLog,
  relToPixel,
  bboxToRect,
  TYPE_HINT_LABELS
} from '../types';
import { loadImage } from '../utils/canvasUtils';
import { ChevronDown, ChevronRight, Eye, Terminal, Layers, GitBranch, Box, Cpu, AlertTriangle, RefreshCw, XCircle, MessageSquare, RotateCcw } from 'lucide-react';
import { RetryOptions } from '../services/geminiService';

interface Props {
  imageBase64: string | null;
  debugData: PipelineDebugData | null;
  currentStage: string;
  onRetryWorker?: (manifestId: string, options: RetryOptions) => Promise<void>;
  onRetryDirector?: (options: RetryOptions) => Promise<void>;
  onRetryArchitect?: (options: RetryOptions) => Promise<void>;
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
}> = ({ imageBase64, geometry, manifest, color, index, onRetry, isRetrying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const render = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = await loadImage(`data:image/png;base64,${imageBase64}`);
      const size = 150;
      canvas.width = size;
      canvas.height = size;

      ctx.drawImage(img, 0, 0, size, size);
      
      // Draw bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      const rect = bboxToRect(geometry.bbox.map(clampRel) as [number,number,number,number], size);
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
          } catch {}
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
    <div className="bg-slate-800 rounded-lg p-2 border border-slate-700">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-medium text-slate-300 truncate flex-1">{manifest?.name || geometry.id}</span>
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
        <div className="mt-2 p-2 bg-slate-900 rounded border border-slate-600 space-y-2">
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

const StageCanvas: React.FC<{
  imageBase64: string;
  title: string;
  icon: React.ReactNode;
  renderOverlay: (ctx: CanvasRenderingContext2D, size: number) => void;
  isActive?: boolean;
  isComplete?: boolean;
}> = ({ imageBase64, title, icon, renderOverlay, isActive, isComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const render = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = await loadImage(`data:image/png;base64,${imageBase64}`);
      const size = 280;
      canvas.width = size;
      canvas.height = size;

      ctx.drawImage(img, 0, 0, size, size);
      renderOverlay(ctx, size);
    };
    render();
  }, [imageBase64, renderOverlay]);

  return (
    <div className={`bg-slate-800 rounded-lg p-3 border ${isActive ? 'border-blue-500 ring-2 ring-blue-500/30' : isComplete ? 'border-emerald-500/50' : 'border-slate-700'}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded ${isActive ? 'bg-blue-500/20 text-blue-400' : isComplete ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
          {icon}
        </div>
        <span className={`text-sm font-medium ${isActive ? 'text-blue-300' : isComplete ? 'text-emerald-300' : 'text-slate-300'}`}>{title}</span>
        {isActive && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse ml-auto" />}
        {isComplete && !isActive && <div className="w-2 h-2 bg-emerald-500 rounded-full ml-auto" />}
      </div>
      <canvas ref={canvasRef} className="w-full rounded border border-slate-600 bg-slate-900" />
    </div>
  );
};

const APILogPanel: React.FC<{ logs: APICallLog[] }> = ({ logs }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFullPrompt, setShowFullPrompt] = useState<Record<string, boolean>>({});

  const formatJSON = (str: string): string => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  };

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700">
      <div className="sticky top-0 bg-slate-800 px-3 py-2 border-b border-slate-700 flex items-center gap-2 z-10">
        <Terminal className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold text-emerald-400">API Call Log</span>
        <span className="text-xs text-slate-500 ml-auto">{logs.length} calls</span>
      </div>
      <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
        {logs.map((log, i) => (
          <div key={log.id} className="p-2">
            <button 
              onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              className="w-full flex items-center gap-2 text-left hover:bg-slate-800/50 rounded p-1"
            >
              {expandedId === log.id ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                log.stage === 'director' ? 'bg-violet-500/20 text-violet-400' :
                log.stage === 'workers' ? 'bg-amber-500/20 text-amber-400' :
                'bg-emerald-500/20 text-emerald-400'
              }`}>
                {log.stage}
              </span>
              <span className="text-xs text-slate-400 truncate flex-1">
                {log.stage === 'workers' ? `Worker #${logs.filter((l, j) => l.stage === 'workers' && j < i).length + 1}` : `${log.stage} call`}
              </span>
              <span className="text-xs text-slate-600">{log.duration}ms</span>
            </button>
            
            {expandedId === log.id && (
              <div className="mt-2 space-y-3 pl-5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500 uppercase">Input Prompt</span>
                    <button 
                      onClick={() => setShowFullPrompt(s => ({ ...s, [log.id]: !s[log.id] }))}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      {showFullPrompt[log.id] ? 'Show Less' : 'Show Full'}
                    </button>
                  </div>
                  <pre className="text-xs text-slate-400 bg-slate-950 p-2 rounded max-h-64 overflow-auto whitespace-pre-wrap font-mono border border-slate-800">
                    {showFullPrompt[log.id] ? log.input.prompt : log.input.prompt.slice(0, 300) + (log.input.prompt.length > 300 ? '...' : '')}
                  </pre>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase mb-1">Output JSON</div>
                  <pre className="text-xs text-emerald-400 bg-slate-950 p-2 rounded max-h-64 overflow-auto whitespace-pre-wrap font-mono border border-slate-800">
                    {formatJSON(log.output)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="p-4 text-center text-slate-500 text-sm">No API calls yet</div>
        )}
      </div>
    </div>
  );
};

// Stage retry panel with fresh/conversational mode
const StageRetryPanel: React.FC<{
  stageName: string;
  stageColor: string;
  onRetry: (options: RetryOptions) => Promise<void>;
  isRetrying: boolean;
  previousResult?: string;
}> = ({ stageName, stageColor, onRetry, isRetrying, previousResult }) => {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleFreshRetry = async () => {
    await onRetry({ mode: 'fresh' });
  };

  const handleConversationalRetry = async () => {
    await onRetry({ 
      mode: 'conversational', 
      userFeedback: feedback || undefined,
      previousResult 
    });
    setFeedback('');
    setShowFeedback(false);
  };

  return (
    <div className="mt-2 p-2 bg-slate-800/50 rounded border border-slate-700">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400">Retry {stageName}:</span>
        <button
          onClick={handleFreshRetry}
          disabled={isRetrying}
          className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
            isRetrying 
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
              : `bg-${stageColor}-500/20 text-${stageColor}-400 hover:bg-${stageColor}-500/30`
          }`}
          style={{ backgroundColor: isRetrying ? undefined : `${stageColor}20`, color: isRetrying ? undefined : stageColor }}
        >
          <RotateCcw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
          Fresh
        </button>
        <button
          onClick={() => setShowFeedback(!showFeedback)}
          disabled={isRetrying || !previousResult}
          className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
            isRetrying || !previousResult
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
              : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
          }`}
          title={previousResult ? "Retry with feedback" : "No previous result to refine"}
        >
          <MessageSquare className="w-3 h-3" />
          With Feedback
        </button>
      </div>
      
      {showFeedback && (
        <div className="mt-2 space-y-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Optional: Describe what should be improved..."
            className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-white placeholder-slate-500 resize-none"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={handleConversationalRetry}
              disabled={isRetrying}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
              Send & Retry
            </button>
            <button
              onClick={() => { setShowFeedback(false); setFeedback(''); }}
              className="px-2 py-1 text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
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
        className={`p-1.5 rounded transition-colors flex-shrink-0 ${
          isRetrying 
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

export const PipelineDebugViewer: React.FC<Props> = ({ 
  imageBase64, 
  debugData, 
  currentStage, 
  onRetryWorker,
  onRetryDirector,
  onRetryArchitect
}) => {
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [retryingStage, setRetryingStage] = useState<string | null>(null);
  
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

  const handleRetryDirector = async (options: RetryOptions) => {
    if (!onRetryDirector) return;
    setRetryingStage('director');
    try {
      await onRetryDirector(options);
    } finally {
      setRetryingStage(null);
    }
  };

  const handleRetryArchitect = async (options: RetryOptions) => {
    if (!onRetryArchitect) return;
    setRetryingStage('architect');
    try {
      await onRetryArchitect(options);
    } finally {
      setRetryingStage(null);
    }
  };

  const isStageComplete = (stage: string): boolean => {
    if (stage === 'director') return !!debugData?.directorOutput;
    if (stage === 'workers') return (debugData?.workerOutputs?.length || 0) > 0 && currentStage !== 'workers';
    if (stage === 'architect') return !!debugData?.architectOutput;
    return false;
  };

  const renderDirectorOverlay = useCallback((ctx: CanvasRenderingContext2D, size: number) => {
    if (!debugData?.directorOutput) return;
    
    debugData.directorOutput.forEach((m, i) => {
      const x = clampRel(m.visual_anchor[0]) * size;
      const y = clampRel(m.visual_anchor[1]) * size;
      const color = COLORS[i % COLORS.length];
      
      // Draw anchor point
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw crosshair
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.lineTo(x + 10, y);
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x, y + 10);
      ctx.stroke();
      
      // Label with background
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      const textWidth = ctx.measureText(m.name).width;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x - textWidth/2 - 2, y - 22, textWidth + 4, 12);
      ctx.fillStyle = color;
      ctx.fillText(m.name, x, y - 13);
    });
  }, [debugData?.directorOutput]);

  const renderArchitectOverlay = useCallback((ctx: CanvasRenderingContext2D, size: number) => {
    if (!debugData?.architectOutput) return;
    
    const parts = debugData.architectOutput;
    const partsById = new Map<string, GamePart>(parts.map(p => [p.id, p]));
    
    parts.forEach((p, i) => {
      const color = COLORS[i % COLORS.length];
      const bbox = p.bbox.map(clampRel) as [number, number, number, number];
      const rect = bboxToRect(bbox, size);
      const pivotX = clampRel(p.pivot.x) * size;
      const pivotY = clampRel(p.pivot.y) * size;
      
      // Draw bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.setLineDash([]);
      
      // Draw hierarchy line to parent
      if (p.parentId) {
        const parent = partsById.get(p.parentId);
        if (parent) {
          const parentPivotX = clampRel(parent.pivot.x) * size;
          const parentPivotY = clampRel(parent.pivot.y) * size;
          
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(pivotX, pivotY);
          ctx.lineTo(parentPivotX, parentPivotY);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      
      // Draw pivot point
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw movement indicator
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      const moveSymbol = p.movementType === 'ROTATION' ? '↻' : 
                         p.movementType === 'SLIDING' ? '↔' :
                         p.movementType === 'ELASTIC' ? '~' : '●';
      ctx.fillText(moveSymbol, pivotX, pivotY + 3);
    });
  }, [debugData?.architectOutput]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Eye className="w-5 h-5 text-indigo-400" />
        <h3 className="text-lg font-semibold text-white">Pipeline Debug View</h3>
        <span className="text-xs text-slate-500 ml-auto">
          {currentStage === 'complete' ? 'Pipeline Complete' : `Stage: ${currentStage}`}
        </span>
      </div>
      
      {/* Stage 1: Director */}
      <div>
        <h4 className="text-sm font-medium text-violet-400 mb-2 flex items-center gap-2">
          <Layers className="w-4 h-4" /> Stage 1: Director - Part Discovery
          {isStageComplete('director') && <span className="text-emerald-400">✓</span>}
        </h4>
        <StageCanvas
          imageBase64={imageBase64}
          title={`Found ${debugData?.directorOutput?.length || 0} parts`}
          icon={<Layers className="w-4 h-4" />}
          renderOverlay={renderDirectorOverlay}
          isActive={currentStage === 'director'}
          isComplete={isStageComplete('director')}
        />
        {onRetryDirector && isStageComplete('director') && (
          <StageRetryPanel
            stageName="Director"
            stageColor="#8b5cf6"
            onRetry={handleRetryDirector}
            isRetrying={retryingStage === 'director'}
            previousResult={debugData?.directorOutput ? JSON.stringify(debugData.directorOutput, null, 2) : undefined}
          />
        )}
      </div>

      {/* Stage 2: Workers - Individual canvases per worker */}
      {((debugData?.workerOutputs?.length || 0) > 0 || (debugData?.workerErrors?.length || 0) > 0) && (
        <div>
          <h4 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
            <Cpu className="w-4 h-4" /> Stage 2: Workers - Geometry Extraction
            {isStageComplete('workers') && (debugData?.workerErrors?.length || 0) === 0 && <span className="text-emerald-400">✓</span>}
            {(debugData?.workerErrors?.length || 0) > 0 && (
              <span className="text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {debugData?.workerErrors?.length} failed
              </span>
            )}
            {currentStage === 'workers' && <span className="text-xs text-slate-500">({debugData?.workerOutputs?.length} complete)</span>}
          </h4>
          
          {/* Successful workers */}
          {(debugData?.workerOutputs?.length || 0) > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-3">
              {debugData?.workerOutputs?.map((geo, i) => {
                const manifest = debugData.directorOutput?.find(m => m.id === geo.id);
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
        </div>
      )}

      {/* Stage 3: Architect */}
      {debugData?.architectOutput && (
        <div>
          <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
            <GitBranch className="w-4 h-4" /> Stage 3: Architect - Hierarchy & Rigging
            {isStageComplete('architect') && <span className="text-emerald-400">✓</span>}
          </h4>
          <StageCanvas
            imageBase64={imageBase64}
            title={`Rigged ${debugData.architectOutput.length} parts`}
            icon={<GitBranch className="w-4 h-4" />}
            renderOverlay={renderArchitectOverlay}
            isActive={currentStage === 'architect'}
            isComplete={isStageComplete('architect')}
          />
          {onRetryArchitect && isStageComplete('architect') && (
            <StageRetryPanel
              stageName="Architect"
              stageColor="#10b981"
              onRetry={handleRetryArchitect}
              isRetrying={retryingStage === 'architect'}
              previousResult={debugData.architectOutput ? JSON.stringify(
                debugData.architectOutput.map(p => ({ 
                  id: p.id, 
                  name: p.name, 
                  parentId: p.parentId, 
                  pivot: p.pivot, 
                  movementType: p.movementType 
                })), null, 2
              ) : undefined}
            />
          )}
        </div>
      )}

      {/* API Log Panel */}
      <div>
        <h4 className="text-sm font-medium text-slate-400 mb-2">API Call History</h4>
        <APILogPanel logs={debugData?.apiLogs || []} />
      </div>
    </div>
  );
};
