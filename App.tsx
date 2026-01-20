import React, { useState, useRef } from 'react';
import { Upload, ArrowRight, Layers, Wand2, Image as ImageIcon, Palette, Monitor, BookOpen, FlaskConical, ChevronLeft, ChevronRight, Cpu, GitBranch, Grid, Sparkles, Scissors, Play, CheckCircle, RefreshCw, MessageSquare, RotateCcw, Terminal } from 'lucide-react';
import { AppState, AtlasResolution, PipelineDebugData, APICallLog, PartManifest, WorkerGeometry, GamePart } from './types';
import { analyzeImageParts, runDirectorOnly, runWorkersOnly, runArchitectOnly, generateAssetArt as generateAssetArtGemini, StreamCallback, StageCallback, DebugCallback, retryWorker, retryDirector, retryArchitect, retryWorkerWithFeedback, RetryOptions, getDebugData } from './services/geminiService';
import { generateAssetArt as generateAssetArtFal } from './services/falService';
import { createAtlasPreparation, PackingAlgorithm, removeBackgroundColor, fitImageToSquare } from './utils/canvasUtils';
import { AnalysisViewer } from './components/AnalysisViewer';
import { AtlasViewer } from './components/AtlasViewer';
import { GeneratedAtlasViewer } from './components/GeneratedAtlasViewer';
import { PreviewAsset } from './components/PreviewAsset';
import { Whitepaper } from './components/Whitepaper';
import { PipelineDebugViewer } from './components/PipelineDebugViewer';
import { KinematicValidator } from './components/KinematicValidator';
import { RigPreview } from './components/RigPreview';

const initialState: AppState = {
  originalImage: null,
  originalImageDimensions: null,
  analysisResults: null,
  annotatedOriginalImage: null,
  preparedAtlasImage: null,
  generatedAtlasImage: null,
  isAnalyzing: false,
  isPreparing: false,
  isGenerating: false,
  resolution: 1024,
  error: null,
  activeStep: 0,
};

interface StreamState {
  thinkingText: string;
  isStreaming: boolean;
  currentStage: string;
  stageMessage: string;
}

type ViewMode = 'pipeline' | 'whitepaper';
type ImageModel = 'gemini' | 'flux';

// Collapsible API Log Panel for each stage
const CollapsibleAPILogs: React.FC<{ logs: APICallLog[]; stageName: string }> = ({ logs, stageName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const stageLogs = logs.filter(l => l.stage.toLowerCase().includes(stageName.toLowerCase()));
  
  if (stageLogs.length === 0) return null;
  
  return (
    <div className="border-l border-slate-700 pl-3">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 mb-2"
      >
        <Terminal className="w-3 h-3" />
        <span>API Logs ({stageLogs.length})</span>
        {isOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {isOpen && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {stageLogs.map((log, i) => (
            <div key={i} className="bg-slate-900 rounded p-2 text-xs border border-slate-700">
              <div className="flex justify-between text-slate-500 mb-1">
                <span>{log.stage}</span>
                <span>{log.duration}ms</span>
              </div>
              <details className="cursor-pointer">
                <summary className="text-slate-400 hover:text-white">View Request/Response</summary>
                <pre className="mt-2 p-2 bg-slate-950 rounded text-[10px] overflow-x-auto max-h-48 overflow-y-auto text-slate-400">
                  {log.input.slice(0, 500)}...
                </pre>
                <pre className="mt-1 p-2 bg-slate-950 rounded text-[10px] overflow-x-auto max-h-48 overflow-y-auto text-emerald-400">
                  {log.output.slice(0, 500)}...
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Stage confirmation/retry controls
const StageControls: React.FC<{
  onConfirm: () => void;
  onRetryFresh: () => void;
  onRetryWithFeedback?: (feedback: string) => void;
  confirmLabel?: string;
  isProcessing?: boolean;
}> = ({ onConfirm, onRetryFresh, onRetryWithFeedback, confirmLabel = "Confirm & Continue", isProcessing }) => {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');

  return (
    <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-slate-700">
      <div className="flex items-center gap-3">
        <button
          onClick={onConfirm}
          disabled={isProcessing}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
          {confirmLabel}
        </button>
        <button
          onClick={onRetryFresh}
          disabled={isProcessing}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          Retry
        </button>
        {onRetryWithFeedback && (
          <button
            onClick={() => setShowFeedback(!showFeedback)}
            disabled={isProcessing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <MessageSquare className="w-4 h-4" />
            With Feedback
          </button>
        )}
      </div>
      {showFeedback && onRetryWithFeedback && (
        <div className="flex gap-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe what should be improved..."
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 resize-none"
            rows={2}
          />
          <button
            onClick={() => { onRetryWithFeedback(feedback); setFeedback(''); setShowFeedback(false); }}
            disabled={isProcessing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [imageModel, setImageModel] = useState<ImageModel>('gemini');
  const [packingAlgorithm, setPackingAlgorithm] = useState<PackingAlgorithm>('grid');
  const [streamState, setStreamState] = useState<StreamState>({ thinkingText: '', isStreaming: false, currentStage: '', stageMessage: '' });
  const [debugData, setDebugData] = useState<PipelineDebugData | null>(null);
  const [showDebug, setShowDebug] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawBase64 = (event.target?.result as string).split(',')[1];
        // Fit image into 1024x1024 white square for Gemini
        const base64 = await fitImageToSquare(rawBase64, 1024);
        setState({
          ...initialState,
          originalImage: base64,
          originalImageDimensions: { w: 1024, h: 1024 },
          activeStep: 1,
        });
        handleRunDirector(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  // Stage 1: Run Director only
  const handleRunDirector = async (base64: string) => {
    setState(s => ({ ...s, isAnalyzing: true, error: null }));
    setStreamState({ thinkingText: '', isStreaming: true, currentStage: 'director', stageMessage: 'Discovering parts...' });
    setDebugData(null);
    try {
      const onStream: StreamCallback = (chunk, done) => {
        setStreamState(s => ({ ...s, thinkingText: chunk, isStreaming: !done }));
      };
      const onDebug: DebugCallback = (data) => {
        setDebugData({ ...data });
      };
      await runDirectorOnly(base64, onStream, onDebug);
      setState(s => ({ ...s, isAnalyzing: false }));
      setStreamState(s => ({ ...s, currentStage: 'director', stageMessage: 'Director complete - confirm to proceed' }));
    } catch (err: any) {
      setState(s => ({ ...s, isAnalyzing: false, error: err.message || "Director failed" }));
      setStreamState(s => ({ ...s, isStreaming: false, currentStage: '', stageMessage: '' }));
    }
  };

  // Stage 2: Run Workers
  const handleRunWorkers = async () => {
    if (!state.originalImage) return;
    setState(s => ({ ...s, isAnalyzing: true, error: null }));
    setStreamState(s => ({ ...s, currentStage: 'workers', stageMessage: 'Extracting geometries...' }));
    try {
      const onDebug: DebugCallback = (data) => {
        setDebugData({ ...data });
      };
      await runWorkersOnly(state.originalImage, onDebug);
      setState(s => ({ ...s, isAnalyzing: false, activeStep: 2 }));
      setStreamState(s => ({ ...s, currentStage: 'workers', stageMessage: 'Workers complete - confirm to proceed' }));
    } catch (err: any) {
      setState(s => ({ ...s, isAnalyzing: false, error: err.message || "Workers failed" }));
    }
  };

  // Stage 3: Run Architect
  const handleRunArchitect = async () => {
    if (!state.originalImage) return;
    setState(s => ({ ...s, isAnalyzing: true, error: null }));
    setStreamState(s => ({ ...s, currentStage: 'architect', stageMessage: 'Building hierarchy...' }));
    try {
      const onStream: StreamCallback = (chunk, done) => {
        setStreamState(s => ({ ...s, thinkingText: chunk, isStreaming: !done }));
      };
      const onDebug: DebugCallback = (data) => {
        setDebugData({ ...data });
      };
      const parts = await runArchitectOnly(state.originalImage, onStream, onDebug);
      setState(s => ({ ...s, isAnalyzing: false, analysisResults: parts, activeStep: 3 }));
      setStreamState(s => ({ ...s, currentStage: 'complete', stageMessage: 'Pipeline complete' }));
    } catch (err: any) {
      setState(s => ({ ...s, isAnalyzing: false, error: err.message || "Architect failed" }));
    }
  };

  // Legacy: Run full pipeline (kept for compatibility)
  const handleAnalyze = async (base64: string) => {
    setState(s => ({ ...s, isAnalyzing: true, error: null }));
    setStreamState({ thinkingText: '', isStreaming: true, currentStage: '', stageMessage: '' });
    setDebugData(null);
    try {
      const onStream: StreamCallback = (chunk, done) => {
        setStreamState(s => ({ ...s, thinkingText: chunk, isStreaming: !done }));
      };
      const onStage: StageCallback = (stage, message) => {
        setStreamState(s => ({ ...s, currentStage: stage, stageMessage: message }));
      };
      const onDebug: DebugCallback = (data) => {
        setDebugData({ ...data });
      };
      const parts = await analyzeImageParts(base64, onStream, onStage, onDebug);
      setState(s => ({ ...s, isAnalyzing: false, analysisResults: parts, activeStep: 3 }));
    } catch (err: any) {
      setState(s => ({ ...s, isAnalyzing: false, error: err.message || "Analysis failed" }));
      setStreamState(s => ({ ...s, isStreaming: false, currentStage: '', stageMessage: '' }));
    }
  };

  const handlePrepareAtlas = async (res?: AtlasResolution, algo?: PackingAlgorithm) => {
    if (!state.originalImage || !state.analysisResults) return;
    const targetRes = res || state.resolution;
    const targetAlgo = algo || packingAlgorithm;
    setState(s => ({ ...s, isPreparing: true, resolution: targetRes }));
    try {
      const { processedImage, annotatedOriginal, partsWithAtlasCoords } = await createAtlasPreparation(
        state.originalImage, 
        state.analysisResults,
        targetRes,
        targetAlgo
      );
      setState(s => ({ 
        ...s, 
        isPreparing: false, 
        annotatedOriginalImage: annotatedOriginal,
        preparedAtlasImage: processedImage,
        analysisResults: partsWithAtlasCoords,
        activeStep: 4 
      }));
    } catch (err: any) {
       setState(s => ({ ...s, isPreparing: false, error: "Failed to create atlas layout" }));
    }
  };

  const handleGenerateAssets = async () => {
     if (!state.annotatedOriginalImage || !state.preparedAtlasImage || !state.analysisResults) return;
     setState(s => ({ ...s, isGenerating: true, error: null }));
     try {
       const generateFn = imageModel === 'flux' ? generateAssetArtFal : generateAssetArtGemini;
       const artBase64 = await generateFn(
         state.annotatedOriginalImage!, 
         state.preparedAtlasImage!, 
         state.analysisResults!,
         "Cyberpunk neon style, high resolution, vector-like quality"
       );
       // Remove white background from generated atlas
       const cleanedAtlas = await removeBackgroundColor(artBase64, { r: 255, g: 255, b: 255 }, 30);
       setState(s => ({ 
           ...s, 
           isGenerating: false, 
           generatedAtlasImage: cleanedAtlas,
           activeStep: 5
       }));
     } catch (err: any) {
       setState(s => ({ ...s, isGenerating: false, error: err.message || "Generation failed" }));
     }
  };

  const handleConfirmArt = () => {
      setState(s => ({ ...s, activeStep: 6 }));
  };

  const renderStep = (index: number, title: string, icon: React.ReactNode, content: React.ReactNode) => {
    if (index > state.activeStep) return null;
    const isActive = state.activeStep === index;
    const isPast = state.activeStep > index;

    return (
      <div className={`relative pl-8 pb-8 border-l-2 ${isPast ? 'border-blue-500' : 'border-slate-700'} last:border-l-0`}>
        <div className={`absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center ${isActive || isPast ? 'bg-blue-600' : 'bg-slate-700'} border-2 border-slate-900 shadow-sm`}>
          {isPast ? <div className="w-2 h-2 bg-white rounded-full" /> : <span className="text-xs font-bold text-white">{index + 1}</span>}
        </div>
        <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50 transition-all duration-300">
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-700/30 text-slate-400'}`}>
              {icon}
            </div>
            <h2 className={`text-lg font-semibold ${isActive ? 'text-white' : 'text-slate-300'}`}>{title}</h2>
          </div>
          <div className={isActive ? 'opacity-100' : 'opacity-80'}>{content}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 lg:p-8 font-sans text-slate-200">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Navigation / Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
              Neural Sprite Pipeline
            </h1>
            <p className="text-xs text-slate-400 tracking-wider uppercase font-medium">
              Decomposition & Reconstruction for 2D Rigged Assets
            </p>
          </div>
          
          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setViewMode('pipeline')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === 'pipeline' 
                ? 'bg-blue-600 text-white shadow-lg' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FlaskConical className="w-4 h-4" />
              Experiment
            </button>
            <button
              onClick={() => setViewMode('whitepaper')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === 'whitepaper' 
                ? 'bg-blue-600 text-white shadow-lg' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Whitepaper
            </button>
          </div>
        </header>

        {viewMode === 'whitepaper' ? (
          <Whitepaper pipelineState={{
            originalImage: state.originalImage,
            annotatedOriginalImage: state.annotatedOriginalImage,
            preparedAtlasImage: state.preparedAtlasImage,
            generatedAtlasImage: state.generatedAtlasImage,
            analysisResults: state.analysisResults,
            isValidated: state.activeStep >= 4
          }} />
        ) : (
          <div className="w-full space-y-6">
            {state.error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6 flex items-center gap-2">
                    <span className="text-red-400 font-bold">Error:</span> {state.error}
                </div>
            )}

            {/* STEP 0: Upload */}
            <div className={`relative pl-8 pb-8 border-l-2 ${state.activeStep > 0 ? 'border-blue-500' : 'border-slate-700'}`}>
                <div className={`absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center ${state.activeStep >= 0 ? 'bg-blue-600' : 'bg-slate-700'} border-2 border-slate-900`}>
                    <span className="text-xs font-bold text-white">1</span>
                </div>
                <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-lg bg-blue-500/20 text-blue-300"><Upload className="w-5 h-5"/></div>
                        <h2 className="text-lg font-semibold text-white">Source Input</h2>
                    </div>
                    {state.originalImage ? (
                        <div className="rounded-lg overflow-hidden border border-slate-600 bg-slate-900 relative group">
                            <img src={`data:image/png;base64,${state.originalImage}`} className="w-full h-64 lg:h-80 object-contain bg-slate-900/50" />
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => {
                                    setState(initialState);
                                    if(fileInputRef.current) fileInputRef.current.value = '';
                                }} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-full text-sm font-medium border border-slate-600">
                                    Change Input
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-lg p-12 text-center cursor-pointer transition-all group">
                            <ImageIcon className="w-8 h-8 text-slate-500 group-hover:text-blue-400 mx-auto mb-2" />
                            <p className="text-slate-300 font-medium">Click to upload raw asset</p>
                            <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileSelect}/>
                        </div>
                    )}
                </div>
            </div>

            {/* STEP 2: Director Analysis */}
            {state.activeStep >= 1 && (
              <div className={`relative pl-8 pb-8 border-l-2 ${state.activeStep > 1 ? 'border-blue-500' : 'border-slate-700'}`}>
                <div className={`absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center ${state.activeStep >= 1 ? 'bg-violet-600' : 'bg-slate-700'} border-2 border-slate-900`}>
                  <span className="text-xs font-bold text-white">2</span>
                </div>
                <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-violet-500/20 text-violet-300"><Layers className="w-5 h-5"/></div>
                    <h2 className="text-lg font-semibold text-white">Director Analysis</h2>
                    {debugData?.directorOutput && <span className="text-xs text-emerald-400 ml-auto">✓ {debugData.directorOutput.length} parts found</span>}
                  </div>
                  
                  <div className="flex gap-4">
                    {/* Main content */}
                    <div className="flex-1">
                      {state.isAnalyzing && streamState.currentStage === 'director' && (
                        <div className="flex flex-col items-center py-6 gap-3">
                          <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                          <p className="text-slate-400 text-sm">{streamState.stageMessage || 'Discovering parts...'}</p>
                        </div>
                      )}
                      
                      {debugData?.directorOutput && (
                        <div className="space-y-4">
                          {/* Image with part anchors overlaid */}
                          <div className="flex gap-4">
                            <div className="relative flex-shrink-0">
                              <img 
                                src={`data:image/png;base64,${state.originalImage}`} 
                                alt="Original" 
                                className="w-64 h-64 object-contain rounded-lg border border-slate-600 bg-slate-900"
                              />
                              {/* Overlay anchors */}
                              <svg className="absolute inset-0 w-64 h-64 pointer-events-none">
                                {debugData.directorOutput.map((manifest, i) => {
                                  const x = manifest.visual_anchor[0] * 256;
                                  const y = manifest.visual_anchor[1] * 256;
                                  const color = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'][i % 8];
                                  return (
                                    <g key={manifest.id}>
                                      <circle cx={x} cy={y} r="8" fill={color} opacity="0.8" />
                                      <circle cx={x} cy={y} r="4" fill="white" />
                                      <line x1={x-12} y1={y} x2={x+12} y2={y} stroke={color} strokeWidth="2" />
                                      <line x1={x} y1={y-12} x2={x} y2={y+12} stroke={color} strokeWidth="2" />
                                      <text x={x+12} y={y-8} fill={color} fontSize="10" fontWeight="bold">{i+1}</text>
                                    </g>
                                  );
                                })}
                              </svg>
                            </div>
                            
                            {/* Part list */}
                            <div className="flex-1 grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                              {debugData.directorOutput.map((manifest, i) => (
                                <div key={manifest.id} className="bg-slate-900 rounded-lg p-2 border border-slate-700">
                                  <div className="flex items-center gap-2 mb-1">
                                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'][i % 8] }}>
                                      {i+1}
                                    </div>
                                    <span className="text-sm font-medium text-white truncate">{manifest.name}</span>
                                  </div>
                                  <div className="text-xs text-slate-500">{manifest.type_hint}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* Always show controls when director output exists and not analyzing */}
                          {!state.isAnalyzing && (
                            <StageControls
                              onConfirm={handleRunWorkers}
                              onRetryFresh={async () => {
                                if (state.originalImage) {
                                  await handleRunDirector(state.originalImage);
                                }
                              }}
                              onRetryWithFeedback={async (feedback) => {
                                if (state.originalImage) {
                                  await retryDirector(state.originalImage, { mode: 'conversational', userFeedback: feedback }, undefined, setDebugData);
                                }
                              }}
                              confirmLabel="Confirm Parts → Run Workers"
                            />
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* API Logs sidebar */}
                    {debugData?.apiLogs && <CollapsibleAPILogs logs={debugData.apiLogs} stageName="director" />}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Workers - Geometry Extraction */}
            {state.activeStep >= 2 && (
              <div className={`relative pl-8 pb-8 border-l-2 ${state.activeStep > 2 ? 'border-blue-500' : 'border-slate-700'}`}>
                <div className={`absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center ${state.activeStep >= 2 ? 'bg-amber-600' : 'bg-slate-700'} border-2 border-slate-900`}>
                  <span className="text-xs font-bold text-white">3</span>
                </div>
                <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300"><Cpu className="w-5 h-5"/></div>
                    <h2 className="text-lg font-semibold text-white">Workers - Geometry Extraction</h2>
                    {debugData?.workerOutputs && debugData.workerOutputs.length > 0 && (
                      <span className="text-xs text-emerald-400 ml-auto">✓ {debugData.workerOutputs.length} geometries</span>
                    )}
                    {(debugData?.workerErrors?.length || 0) > 0 && (
                      <span className="text-xs text-red-400">{debugData?.workerErrors?.length} failed</span>
                    )}
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="flex-1">
                      {state.isAnalyzing && streamState.currentStage === 'workers' && (
                        <div className="flex flex-col items-center py-6 gap-3">
                          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                          <p className="text-slate-400 text-sm">{streamState.stageMessage || 'Extracting geometries...'}</p>
                        </div>
                      )}
                      
                      {debugData?.workerOutputs && debugData.workerOutputs.length > 0 && (
                        <div className="space-y-3">
                          <PipelineDebugViewer 
                            imageBase64={state.originalImage}
                            debugData={debugData}
                            currentStage={state.isAnalyzing ? streamState.currentStage : "complete"}
                            onRetryWorker={async (manifestId, options) => {
                              if (state.originalImage) {
                                if (options.mode === 'conversational') {
                                  await retryWorkerWithFeedback(state.originalImage, manifestId, options, setDebugData);
                                } else {
                                  await retryWorker(state.originalImage, manifestId, setDebugData);
                                }
                              }
                            }}
                          />
                          
                          {state.activeStep === 2 && !state.isAnalyzing && (
                            <StageControls
                              onConfirm={handleRunArchitect}
                              onRetryFresh={handleRunWorkers}
                              confirmLabel="Confirm Geometries → Run Architect"
                            />
                          )}
                        </div>
                      )}
                    </div>
                    
                    {debugData?.apiLogs && <CollapsibleAPILogs logs={debugData.apiLogs} stageName="workers" />}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Rigging Architect */}
            {state.activeStep >= 3 && (
              <div className={`relative pl-8 pb-8 border-l-2 ${state.activeStep > 3 ? 'border-blue-500' : 'border-slate-700'}`}>
                <div className={`absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center ${state.activeStep >= 3 ? 'bg-emerald-600' : 'bg-slate-700'} border-2 border-slate-900`}>
                  <span className="text-xs font-bold text-white">4</span>
                </div>
                <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300"><GitBranch className="w-5 h-5"/></div>
                    <h2 className="text-lg font-semibold text-white">Rigging Architect</h2>
                    {state.analysisResults && <span className="text-xs text-emerald-400 ml-auto">✓ {state.analysisResults.length} parts rigged</span>}
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="flex-1">
                      {state.isAnalyzing && streamState.currentStage === 'architect' && (
                        <div className="flex flex-col items-center py-6 gap-3">
                          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                          <p className="text-slate-400 text-sm">{streamState.stageMessage || 'Building rig hierarchy...'}</p>
                        </div>
                      )}
                      
                      {state.analysisResults && !state.isAnalyzing && (
                        <div className="space-y-4">
                          {/* 3 visual previews in a row */}
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* Animated Rig Preview */}
                            <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                              <h4 className="text-xs font-medium text-slate-400 uppercase mb-2">Animated Preview</h4>
                              {state.originalImage && (
                                <RigPreview 
                                  originalImageBase64={state.originalImage}
                                  parts={state.analysisResults}
                                  onConfirm={() => {}}
                                  onRetry={() => {}}
                                  compact
                                />
                              )}
                            </div>
                            
                            {/* Kinematic Validation */}
                            <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                              <h4 className="text-xs font-medium text-slate-400 uppercase mb-2">Kinematic Validation</h4>
                              <KinematicValidator parts={state.analysisResults} compact />
                            </div>
                            
                            {/* Part Hierarchy Tree */}
                            <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                              <h4 className="text-xs font-medium text-slate-400 uppercase mb-2">Part Hierarchy</h4>
                              <AnalysisViewer 
                                parts={state.analysisResults} 
                                onConfirm={() => {}}
                                onRetry={() => {}}
                                compact
                              />
                            </div>
                          </div>
                          
                          {state.activeStep === 3 && (
                            <StageControls
                              onConfirm={() => handlePrepareAtlas(state.resolution)}
                              onRetryFresh={async () => {
                                if (state.originalImage) {
                                  await retryArchitect(state.originalImage, { mode: 'fresh' }, undefined, setDebugData);
                                }
                              }}
                              onRetryWithFeedback={async (feedback) => {
                                if (state.originalImage) {
                                  const newParts = await retryArchitect(state.originalImage, { mode: 'conversational', userFeedback: feedback }, undefined, setDebugData);
                                  setState(s => ({ ...s, analysisResults: newParts }));
                                }
                              }}
                              confirmLabel="Confirm Rig → Atlas"
                            />
                          )}
                        </div>
                      )}
                    </div>
                    
                    {debugData?.apiLogs && <CollapsibleAPILogs logs={debugData.apiLogs} stageName="architect" />}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: Atlas Preparation */}
            {state.activeStep >= 4 && (
              <div className={`relative pl-8 pb-8 border-l-2 ${state.activeStep > 4 ? 'border-blue-500' : 'border-slate-700'}`}>
                <div className={`absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center ${state.activeStep >= 4 ? 'bg-cyan-600' : 'bg-slate-700'} border-2 border-slate-900`}>
                  <span className="text-xs font-bold text-white">5</span>
                </div>
                <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-300"><Grid className="w-5 h-5"/></div>
                    <h2 className="text-lg font-semibold text-white">Atlas Preparation</h2>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center gap-2 p-2 bg-slate-900/50 rounded-lg border border-slate-700">
                        <span className="text-xs text-slate-400 uppercase font-bold">Resolution</span>
                        <div className="flex gap-1">
                          {[1024, 2048].map(res => (
                            <button key={res} onClick={() => handlePrepareAtlas(res as AtlasResolution, packingAlgorithm)}
                              className={`px-3 py-1 rounded text-xs font-medium ${state.resolution === res ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                              {res === 1024 ? '1K' : '2K'}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 p-2 bg-slate-900/50 rounded-lg border border-slate-700">
                        <span className="text-xs text-slate-400 uppercase font-bold">Packing</span>
                        <div className="flex gap-1">
                          {(['row', 'grid', 'maxrects'] as PackingAlgorithm[]).map(algo => (
                            <button key={algo} onClick={() => { setPackingAlgorithm(algo); handlePrepareAtlas(state.resolution, algo); }}
                              className={`px-3 py-1 rounded text-xs font-medium ${packingAlgorithm === algo ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                              {algo === 'row' ? 'Row' : algo === 'grid' ? 'Grid' : 'MaxRects'}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 p-2 bg-slate-900/50 rounded-lg border border-slate-700">
                        <span className="text-xs text-slate-400 uppercase font-bold">Model</span>
                        <div className="flex gap-1">
                          <button onClick={() => setImageModel('gemini')}
                            className={`px-3 py-1 rounded text-xs font-medium ${imageModel === 'gemini' ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                            Gemini
                          </button>
                          <button onClick={() => setImageModel('flux')}
                            className={`px-3 py-1 rounded text-xs font-medium ${imageModel === 'flux' ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                            Flux
                          </button>
                        </div>
                      </div>
                    </div>

                    {state.isPreparing && <div className="text-center py-4 text-slate-400">Optimizing layout...</div>}
                    
                    {!state.isPreparing && state.preparedAtlasImage && (
                      <AtlasViewer 
                        originalImageBase64={state.annotatedOriginalImage!}
                        atlasImageBase64={state.preparedAtlasImage}
                        onConfirm={handleGenerateAssets}
                        onRetry={() => handlePrepareAtlas(state.resolution, packingAlgorithm)}
                        isGenerating={state.isGenerating}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: Generated Sprite Atlas */}
            {state.activeStep >= 5 && state.generatedAtlasImage && (
              <div className={`relative pl-8 pb-8 border-l-2 ${state.activeStep > 5 ? 'border-blue-500' : 'border-slate-700'}`}>
                <div className={`absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center ${state.activeStep >= 5 ? 'bg-pink-600' : 'bg-slate-700'} border-2 border-slate-900`}>
                  <span className="text-xs font-bold text-white">6</span>
                </div>
                <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-pink-500/20 text-pink-300"><Sparkles className="w-5 h-5"/></div>
                    <h2 className="text-lg font-semibold text-white">Generated Sprite Atlas</h2>
                  </div>
                  
                  <GeneratedAtlasViewer 
                    imageBase64={state.generatedAtlasImage}
                    onConfirm={handleConfirmArt}
                    onRetry={handleGenerateAssets}
                  />
                </div>
              </div>
            )}

            {/* STEP 7: Final Animation Preview */}
            {state.activeStep >= 6 && state.generatedAtlasImage && state.analysisResults && (
              <div className="relative pl-8 pb-8">
                <div className="absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center bg-indigo-600 border-2 border-slate-900">
                  <span className="text-xs font-bold text-white">7</span>
                </div>
                <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300"><Play className="w-5 h-5"/></div>
                    <h2 className="text-lg font-semibold text-white">Final Animation Preview</h2>
                  </div>
                  
                  <PreviewAsset 
                    atlasBase64={state.generatedAtlasImage}
                    parts={state.analysisResults}
                  />
                  <p className="text-center text-xs text-slate-500 italic mt-4">
                    Real-time simulation using generated sprite atlas.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}