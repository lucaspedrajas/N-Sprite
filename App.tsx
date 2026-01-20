import React, { useState, useRef } from 'react';
import { Upload, ArrowRight, Layers, Wand2, Image as ImageIcon, Palette, Monitor, BookOpen, FlaskConical, ChevronLeft, ChevronRight, Cpu, GitBranch, Grid, Sparkles, Scissors, Play, CheckCircle, RefreshCw, MessageSquare, RotateCcw, Terminal } from 'lucide-react';
import { AppState, AtlasResolution, PipelineDebugData, APICallLog, PartManifest, WorkerGeometry, GamePart, StreamState } from './types';
import { runDirectorOnly, runWorkersOnly, runArchitectOnly, generateAssetArt as generateAssetArtGemini, StreamCallback, StageCallback, DebugCallback, retryWorker, retryDirector, retryArchitect, retryWorkerWithFeedback, RetryOptions, getDebugData } from './services/geminiService';
import { generateAssetArt as generateAssetArtFal } from './services/falService';
import { createAtlasPreparation, PackingAlgorithm, removeBackgroundColor, fitImageToSquare } from './utils/canvasUtils';
import { AtlasViewer } from './components/AtlasViewer';
import { GeneratedAtlasViewer } from './components/GeneratedAtlasViewer';
import { Whitepaper } from './components/Whitepaper';
import { Visualizer2D } from './components/Visualizer2D';
// New Step Components
import { DirectorStep } from './components/DirectorStep';
import { WorkersStep } from './components/WorkersStep';
import { ArchitectStep } from './components/ArchitectStep';
import { ApiCallLog } from './components/ApiCallLog';
import { StageControls } from './components/StageControls';

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

type ViewMode = 'pipeline' | 'whitepaper';
type ImageModel = 'gemini' | 'flux';

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [debugData, setDebugData] = useState<PipelineDebugData | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [imageModel, setImageModel] = useState<ImageModel>('gemini');
  const [packingAlgorithm, setPackingAlgorithm] = useState<PackingAlgorithm>('row');

  // Stream state for localized loading messages
  const [streamState, setStreamState] = useState<StreamState>({
    thinkingText: '',
    isStreaming: false,
    currentStage: '',
    stageMessage: ''
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      // strip prefix for processing since fitImageToSquare expects raw base64 (and adds its own prefix for loading)
      const rawBase64 = result.split(',')[1];

      // Pre-process image to fit square aspect ratio
      const image = new Image();
      image.src = result;
      image.onload = async () => {
        const processedRawBase64 = await fitImageToSquare(rawBase64);

        // Add prefix for UI preview
        setUploadPreview(`data:image/png;base64,${processedRawBase64}`);

        setState(prev => ({
          ...prev,
          originalImage: processedRawBase64,
          originalImageDimensions: { width: image.width, height: image.height }, // Note: this might be slightly off if fitImageToSquare resized it, but we use strict 1024 anyway
          activeStep: 1,
          error: null
        }));
      };
    };
    reader.readAsDataURL(file);
  };

  const handleStreamUpdate: StreamCallback = (text) => {
    setStreamState(prev => ({ ...prev, thinkingText: text, isStreaming: true }));
  };

  const handleStageUpdate: StageCallback = (stage, message) => {
    setStreamState(prev => ({ ...prev, currentStage: stage, stageMessage: message }));
  };

  const handleDebugUpdate: DebugCallback = (data) => {
    setDebugData(JSON.parse(JSON.stringify(data)));
  };

  const handleError = (err: any) => {
    console.error(err);
    setState(prev => ({
      ...prev,
      isAnalyzing: false,
      error: err instanceof Error ? err.message : 'An unknown error occurred'
    }));
    setStreamState(prev => ({ ...prev, isStreaming: false, thinkingText: '' }));
  };


  // --- Pipeline Orchestration Handlers ---

  const handleRunDirector = async (imageBase64: string) => {
    if (!imageBase64) return;
    setState(prev => ({ ...prev, isAnalyzing: true, activeStep: 2, error: null }));
    setStreamState({ thinkingText: '', isStreaming: true, currentStage: 'director', stageMessage: 'Analyzing image structure...' });

    try {
      const debugResult = await runDirectorOnly(
        imageBase64,
        handleStreamUpdate,
        handleStageUpdate,
        handleDebugUpdate
      );
      setDebugData(debugResult);
      setDebugData(debugResult);
      setState(prev => ({ ...prev, isAnalyzing: false })); // activeStep already 2
    } catch (err) {
      handleError(err);
    }
  };

  const handleRunWorkers = async () => {
    if (!state.originalImage || !debugData?.directorOutput) return;
    setState(prev => ({ ...prev, isAnalyzing: true, activeStep: 3, error: null }));
    setStreamState({ thinkingText: '', isStreaming: true, currentStage: 'workers', stageMessage: 'Extracting geometries...' });

    try {
      // Reuse existing debugData context
      const updatedDebugData = await runWorkersOnly(
        state.originalImage,
        debugData.directorOutput,
        handleStreamUpdate,
        handleStageUpdate,
        handleDebugUpdate,
        debugData // pass existing context
      );
      setDebugData(updatedDebugData);
      setDebugData(updatedDebugData);
      setState(prev => ({ ...prev, isAnalyzing: false })); // activeStep already 3
    } catch (err) {
      handleError(err);
    }
  };

  const handleRunArchitect = async () => {
    if (!state.originalImage || !debugData?.workerOutputs) return;
    setState(prev => ({ ...prev, isAnalyzing: true, activeStep: 4, error: null }));
    setStreamState({ thinkingText: '', isStreaming: true, currentStage: 'architect', stageMessage: 'Building rig hierarchy...' });

    try {
      const finalDebugData = await runArchitectOnly(
        state.originalImage,
        debugData.workerOutputs,
        handleStreamUpdate,
        handleStageUpdate,
        handleDebugUpdate,
        debugData
      );
      setDebugData(finalDebugData);
      setState(prev => ({
        ...prev,
        isAnalyzing: false,
        analysisResults: finalDebugData.architectOutput,
        activeStep: 4
      }));
    } catch (err) {
      handleError(err);
    }
  };


  const handlePrepareAtlas = async (res: AtlasResolution = state.resolution, algo: PackingAlgorithm = packingAlgorithm) => {
    if (!state.analysisResults || !state.originalImage || !state.originalImageDimensions) {
      console.error("Missing data for atlas preparation");
      return;
    }

    setState(prev => ({ ...prev, isPreparing: true, error: null, resolution: res })); // Update resolution state
    setPackingAlgorithm(algo); // Update algorithm state

    try {
      const result = await createAtlasPreparation(
        state.originalImage,
        state.analysisResults,
        res,
        algo
      );

      setState(prev => ({
        ...prev,
        isPreparing: false,
        preparedAtlasImage: result.processedImage,
        annotatedOriginalImage: result.annotatedOriginal, // Capture the annotated image
        analysisResults: result.partsWithAtlasCoords, // Updated with atlasRects
        activeStep: 5
      }));
    } catch (err) {
      handleError(err);
    }
  };

  const handleGenerateArt = async () => {
    if (!state.analysisResults || !state.preparedAtlasImage) return;

    setState(prev => ({ ...prev, isGenerating: true, error: null }));
    try {
      let generatedImageBase64: string;

      if (imageModel === 'flux') {
        generatedImageBase64 = await generateAssetArtFal(
          state.originalImage!,
          state.preparedAtlasImage,
          state.analysisResults!
        );
      } else {
        generatedImageBase64 = await generateAssetArtGemini(
          state.originalImage!,
          state.preparedAtlasImage,
          state.analysisResults!
        );
      }

      // Remove background from the generated art
      const bgRemoved = await removeBackgroundColor(generatedImageBase64);

      setState(prev => ({
        ...prev,
        isGenerating: false,
        generatedAtlasImage: bgRemoved,
        activeStep: 6
      }));
    } catch (err) {
      handleError(err);
    }
  };

  const retryArchitectHandler = async (options: RetryOptions) => {
    if (!state.originalImage) return;
    await retryArchitect(state.originalImage, options, undefined, setDebugData);
    // After retry, debugData is updated via setDebugData, need to sync analysisResults
    const currentDebug = getDebugData(); // Or access from state if sync is instant? React state updates are async.
    // Better to update local state with result from hook if possible, or rely on debugData consistency.
    // The retry functions update the Global/Callback debug data.
    // We should probably rely on manual sync or updated `analysisResults` from the `debugData` in a `useEffect` if we wanted perfect sync.
    // simpler: update state from the latest debugData after a short delay or return value.
    if (currentDebug?.architectOutput) {
      setState(s => ({ ...s, analysisResults: currentDebug.architectOutput }));
    }
  };

  // Effect to sync analysisResults from debugData if available (ensures consistency)
  React.useEffect(() => {
    if (debugData?.architectOutput) {
      setState(s => ({ ...s, analysisResults: debugData.architectOutput }));
    }
  }, [debugData?.architectOutput]);


  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 z-50 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg shadow-lg shadow-indigo-500/20">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              N-Sprite
            </h1>
            <p className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">Neural Sprite Rigging Agent</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => setViewMode('pipeline')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'pipeline' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              Pipeline
            </button>
            <button
              onClick={() => setViewMode('whitepaper')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'whitepaper' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              Whitepaper
            </button>
          </div>
          <a href="https://github.com/lucaspedrajas/N-Sprite" target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-slate-800 rounded-full transition-colors">
            <Monitor className="w-5 h-5 text-slate-400 transition-colors hover:text-white" />
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-12 px-6 max-w-[1600px] mx-auto min-h-screen">
        {viewMode === 'whitepaper' ? (
          <Whitepaper />
        ) : (
          <div className="flex gap-6 items-start h-[calc(100vh-8rem)]">
            {/* Left Sidebar: API Logs */}
            <div className="w-80 flex-shrink-0 h-full flex flex-col min-h-0 bg-slate-900/50 rounded-xl border border-slate-800/50 overflow-hidden">
              <ApiCallLog logs={debugData?.apiLogs || []} className="h-full border-0" />
            </div>

            {/* Center: Wizard Steps */}
            <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar pb-20">
              {/* Step 1: Upload */}
              <div className={`relative pl-8 pb-8 border-l-2 ${state.activeStep > 1 ? 'border-violet-500' : 'border-slate-700'}`}>
                <div className={`absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center ${state.activeStep >= 1 ? 'bg-indigo-600' : 'bg-slate-700'} border-2 border-slate-900`}>
                  <span className="text-xs font-bold text-white">1</span>
                </div>

                <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300"><ImageIcon className="w-5 h-5" /></div>
                    <h2 className="text-lg font-semibold text-white">Source Input</h2>
                  </div>

                  {!state.originalImage ? (
                    <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors group">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <div className="p-3 bg-slate-700 rounded-full mb-3 group-hover:scale-110 transition-transform duration-300">
                          <Upload className="w-6 h-6 text-indigo-400 group-hover:text-indigo-300" />
                        </div>
                        <p className="mb-2 text-sm text-slate-300 font-medium">Click to upload character art</p>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">PNG, JPG (Square aspect recommended)</p>
                      </div>
                      <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                    </label>
                  ) : (
                    <div className="flex gap-6 items-start">
                      <div className="relative group">
                        <img src={uploadPreview || ""} alt="Source" className="w-48 h-48 object-cover rounded-lg border-2 border-indigo-500/50 shadow-xl" />
                        <button
                          onClick={() => {
                            setState(initialState);
                            setDebugData(null);
                            setUploadPreview(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex-1 space-y-4">
                        <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-700">
                          <h3 className="text-sm font-semibold text-slate-300 mb-1">Image Analysis</h3>
                          <p className="text-xs text-slate-400">
                            Ready to analyze. This process will extract parts, rig them, and prepare for animation.
                          </p>
                        </div>
                        {state.activeStep === 1 && (
                          <button
                            onClick={() => handleRunDirector(state.originalImage!)}
                            disabled={state.isAnalyzing}
                            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all hover:translate-x-1"
                          >
                            {state.isAnalyzing ? <span className="animate-spin">⟳</span> : <Wand2 className="w-4 h-4" />}
                            Start Magic Analysis
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Director */}
              {state.activeStep >= 2 && (
                <div className={`relative pl-8 pb-8 border-l-2 ${state.activeStep > 2 ? 'border-violet-500' : 'border-slate-700'}`}>
                  <div className={`absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center ${state.activeStep >= 2 ? 'bg-violet-600' : 'bg-slate-700'} border-2 border-slate-900`}>
                    <span className="text-xs font-bold text-white">2</span>
                  </div>
                  <DirectorStep
                    imageBase64={state.originalImage}
                    debugData={debugData}
                    isAnalyzing={state.isAnalyzing}
                    streamState={streamState}
                    onConfirm={handleRunWorkers}
                    onRetryFresh={async () => { if (state.originalImage) await handleRunDirector(state.originalImage); }}
                    onRetryWithFeedback={async (fb) => { if (state.originalImage) await retryDirector(state.originalImage, { mode: 'conversational', userFeedback: fb }, undefined, setDebugData); }}
                  />
                </div>
              )}

              {/* Step 3: Workers */}
              {state.activeStep >= 3 && (
                <div className={`relative pl-8 pb-8 border-l-2 ${state.activeStep > 3 ? 'border-amber-500' : 'border-slate-700'}`}>
                  <div className={`absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center ${state.activeStep >= 3 ? 'bg-amber-600' : 'bg-slate-700'} border-2 border-slate-900`}>
                    <span className="text-xs font-bold text-white">3</span>
                  </div>
                  <WorkersStep
                    imageBase64={state.originalImage}
                    debugData={debugData}
                    currentStage={state.isAnalyzing ? streamState.currentStage : "complete"}
                    isAnalyzing={state.isAnalyzing}
                    streamState={streamState}
                    onConfirm={handleRunArchitect}
                    onRetryFresh={handleRunWorkers}
                    onRetryWorker={async (id, opts) => {
                      if (state.originalImage) {
                        if (opts.mode === 'conversational') await retryWorkerWithFeedback(state.originalImage, id, opts, setDebugData);
                        else await retryWorker(state.originalImage, id, setDebugData);
                      }
                    }}
                  />
                </div>
              )}

              {/* Step 4: Architect */}
              {state.activeStep >= 4 && (
                <div className={`relative pl-8 pb-8 border-l-2 ${state.activeStep > 4 ? 'border-emerald-500' : 'border-slate-700'}`}>
                  <div className={`absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center ${state.activeStep >= 4 ? 'bg-emerald-600' : 'bg-slate-700'} border-2 border-slate-900`}>
                    <span className="text-xs font-bold text-white">4</span>
                  </div>
                  <ArchitectStep
                    analysisResults={state.analysisResults}
                    originalImage={state.originalImage}
                    isAnalyzing={state.isAnalyzing}
                    streamState={streamState}
                    onConfirm={() => handlePrepareAtlas(state.resolution, packingAlgorithm)}
                    onRetryFresh={async () => { if (state.originalImage) await retryArchitect(state.originalImage, { mode: 'fresh' }, undefined, setDebugData); }}
                    onRetryWithFeedback={async (fb) => { if (state.originalImage) await retryArchitect(state.originalImage, { mode: 'conversational', userFeedback: fb }, undefined, setDebugData); }}
                  />
                </div>
              )}

              {/* STEP 5: Atlas Preparation */}
              {state.activeStep >= 5 && (
                <div className={`relative pl-8 pb-8 border-l-2 ${state.activeStep > 5 ? 'border-pink-500' : 'border-slate-700'}`}>
                  <div className={`absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center ${state.activeStep >= 5 ? 'bg-pink-600' : 'bg-slate-700'} border-2 border-slate-900`}>
                    <span className="text-xs font-bold text-white">5</span>
                  </div>
                  <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-pink-500/20 text-pink-300"><Grid className="w-5 h-5" /></div>
                      <h2 className="text-lg font-semibold text-white">Atlas Generation</h2>
                      {state.preparedAtlasImage && <span className="text-xs text-emerald-400 ml-auto">✓ Generated {state.resolution}px atlas</span>}
                    </div>

                    {state.preparedAtlasImage ? (
                      <AtlasViewer
                        originalImageBase64={state.annotatedOriginalImage || state.originalImage!}
                        atlasImageBase64={state.preparedAtlasImage}
                        onConfirm={handleGenerateArt}
                        onRetry={(res, algo, model) => {
                          // If model changed, update it
                          if (model) setImageModel(model);
                          handlePrepareAtlas(res, algo);
                        }}
                        isGenerating={state.isGenerating}
                        currentResolution={state.resolution}
                        currentAlgorithm={packingAlgorithm}
                        currentModel={imageModel}
                      />
                    ) : (
                      <div className="h-32 flex items-center justify-center text-slate-500 bg-slate-900 rounded">
                        {state.isPreparing ? (
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                            <span>Packing sprites...</span>
                          </div>
                        ) : "Waiting for atlas..."}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 6 & 7 (Art Generation & Final Preview) */}
              {state.activeStep >= 6 && (
                <div className="relative pl-8 pb-8 border-l-2 border-slate-700">
                  <div className="absolute -left-[11px] top-0 w-6 h-6 rounded-full flex items-center justify-center bg-cyan-600 border-2 border-slate-900">
                    <span className="text-xs font-bold text-white">6</span>
                  </div>
                  <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700/50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-300"><Palette className="w-5 h-5" /></div>
                      <h2 className="text-lg font-semibold text-white">Final Art Generation</h2>
                    </div>
                    <div className="space-y-4">
                      {state.generatedAtlasImage ? (
                        <div className="space-y-6">
                          <GeneratedAtlasViewer
                            imageBase64={state.generatedAtlasImage}
                            onConfirm={() => {
                              // Just scroll to visualizer or enhance visualizer engagement
                            }}
                            onRetry={handleGenerateArt}
                          />

                          {/* Final Preview Visualizer */}
                          <div className="bg-black/40 p-4 rounded-xl border border-slate-700/50">
                            <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                              <Play className="w-4 h-4 text-emerald-400" /> Live Preview
                            </h4>
                            <Visualizer2D
                              parts={state.analysisResults!}
                              atlasBase64={state.generatedAtlasImage}
                              mode="atlas"
                              width={600}
                              height={400}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="h-48 flex items-center justify-center bg-slate-900 rounded border border-slate-700 border-dashed">
                          {state.isGenerating ? (
                            <div className="text-center">
                              <div className="w-8 h-8 mx-auto mb-3 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                              <p className="text-slate-400">Dreaming up pixels...</p>
                              <p className="text-xs text-slate-600 mt-1">Model: {imageModel}</p>
                            </div>
                          ) : (
                            <div className="flex gap-4">
                              <button
                                onClick={() => setImageModel('gemini')}
                                className={`p-4 rounded border ${imageModel === 'gemini' ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 hover:bg-slate-800'}`}
                              >
                                Gemini Art
                              </button>
                              <button
                                onClick={() => setImageModel('flux')}
                                className={`p-4 rounded border ${imageModel === 'flux' ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-700 hover:bg-slate-800'}`}
                              >
                                Flux Art
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}