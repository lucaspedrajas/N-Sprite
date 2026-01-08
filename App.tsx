import React, { useState, useRef } from 'react';
import { Upload, ArrowRight, Layers, Wand2, Image as ImageIcon, Palette, Monitor, BookOpen, FlaskConical } from 'lucide-react';
import { AppState, AtlasResolution } from './types';
import { analyzeImageParts, generateAssetArt as generateAssetArtGemini, StreamCallback } from './services/geminiService';
import { generateAssetArt as generateAssetArtFal } from './services/falService';
import { createAtlasPreparation, PackingAlgorithm, removeBackgroundColor, fitImageToSquare } from './utils/canvasUtils';
import { AnalysisViewer } from './components/AnalysisViewer';
import { AtlasViewer } from './components/AtlasViewer';
import { GeneratedAtlasViewer } from './components/GeneratedAtlasViewer';
import { PreviewAsset } from './components/PreviewAsset';
import { Whitepaper } from './components/Whitepaper';

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
}

type ViewMode = 'pipeline' | 'whitepaper';
type ImageModel = 'gemini' | 'flux';


export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [imageModel, setImageModel] = useState<ImageModel>('gemini');
  const [packingAlgorithm, setPackingAlgorithm] = useState<PackingAlgorithm>('grid');
  const [streamState, setStreamState] = useState<StreamState>({ thinkingText: '', isStreaming: false });
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
        handleAnalyze(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async (base64: string) => {
    setState(s => ({ ...s, isAnalyzing: true, error: null }));
    setStreamState({ thinkingText: '', isStreaming: true });
    try {
      const onStream: StreamCallback = (chunk, done) => {
        setStreamState({ thinkingText: chunk, isStreaming: !done });
      };
      const parts = await analyzeImageParts(base64, onStream);
      setState(s => ({ ...s, isAnalyzing: false, analysisResults: parts }));
    } catch (err: any) {
      setState(s => ({ ...s, isAnalyzing: false, error: err.message || "Analysis failed" }));
      setStreamState(s => ({ ...s, isStreaming: false }));
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
        activeStep: 2 
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
           activeStep: 3
       }));
     } catch (err: any) {
       setState(s => ({ ...s, isGenerating: false, error: err.message || "Generation failed" }));
     }
  };

  const handleConfirmArt = () => {
      setState(s => ({ ...s, activeStep: 4 }));
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
    <div className="min-h-screen bg-slate-950 p-4 md:p-8 font-sans text-slate-200">
      <div className="max-w-4xl mx-auto space-y-8">
        
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
          <Whitepaper />
        ) : (
          <div className="max-w-xl mx-auto space-y-8">
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
                            <img src={`data:image/png;base64,${state.originalImage}`} className="w-full h-48 object-contain bg-slate-900/50" />
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
                        <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-lg p-8 text-center cursor-pointer transition-all group">
                            <ImageIcon className="w-8 h-8 text-slate-500 group-hover:text-blue-400 mx-auto mb-2" />
                            <p className="text-slate-300 font-medium">Click to upload raw asset</p>
                            <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileSelect}/>
                        </div>
                    )}
                </div>
            </div>

            {renderStep(1, "Semantic Analysis", <Layers className="w-5 h-5" />, (
                <>
                    {state.isAnalyzing && (
                        <div className="flex flex-col items-center py-6 gap-3">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-slate-400 text-sm">Inferring structure via Multimodal LLM...</p>
                            {streamState.thinkingText && (
                              <div className="w-full mt-4 p-3 bg-slate-900/80 rounded-lg border border-slate-700 max-h-48 overflow-y-auto">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">LLM Response</span>
                                </div>
                                <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
                                  {streamState.thinkingText}
                                </pre>
                              </div>
                            )}
                        </div>
                    )}
                    {!state.isAnalyzing && state.analysisResults && (
                        <AnalysisViewer 
                            parts={state.analysisResults} 
                            onConfirm={() => handlePrepareAtlas(state.resolution)}
                            onRetry={() => state.originalImage && handleAnalyze(state.originalImage)}
                        />
                    )}
                </>
            ))}

            {renderStep(2, "Atlas Optimization", <Monitor className="w-5 h-5" />, (
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg border border-slate-700">
                        <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Resolution</span>
                        <div className="flex gap-2">
                            {[1024, 2048].map(res => (
                                <button
                                    key={res}
                                    onClick={() => handlePrepareAtlas(res as AtlasResolution, packingAlgorithm)}
                                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${state.resolution === res ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                                >
                                    {res === 1024 ? '1K' : '2K'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg border border-slate-700">
                        <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Packing</span>
                        <div className="flex gap-2">
                            {(['row', 'grid', 'maxrects'] as PackingAlgorithm[]).map(algo => (
                                <button
                                    key={algo}
                                    onClick={() => {
                                        setPackingAlgorithm(algo);
                                        handlePrepareAtlas(state.resolution, algo);
                                    }}
                                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${packingAlgorithm === algo ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                                >
                                    {algo === 'row' ? 'Row' : algo === 'grid' ? 'Grid' : 'MaxRects'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg border border-slate-700">
                        <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Image Model</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setImageModel('flux')}
                                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${imageModel === 'flux' ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                            >
                                Flux 2 Pro
                            </button>
                            <button
                                onClick={() => setImageModel('gemini')}
                                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${imageModel === 'gemini' ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                            >
                                Gemini
                            </button>
                        </div>
                    </div>

                    {state.isPreparing && <div className="text-center py-4 text-slate-400">Optimizing layout packing...</div>}
                    
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
            ))}

            {renderStep(3, "Generative Reconstruction", <Palette className="w-5 h-5" />, (
                <>
                    {state.generatedAtlasImage && (
                        <GeneratedAtlasViewer 
                            imageBase64={state.generatedAtlasImage}
                            onConfirm={handleConfirmArt}
                            onRetry={handleGenerateAssets}
                        />
                    )}
                </>
            ))}

            {renderStep(4, "Kinematic Validation", <ArrowRight className="w-5 h-5" />, (
                <div className="space-y-4">
                    {state.generatedAtlasImage && state.analysisResults && (
                        <>
                            <PreviewAsset 
                                atlasBase64={state.generatedAtlasImage}
                                parts={state.analysisResults}
                            />
                            <p className="text-center text-xs text-slate-500 italic">
                            Real-time simulation based on inferred mechanical properties.
                            </p>
                        </>
                    )}
                </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}