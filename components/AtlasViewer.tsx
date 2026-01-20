import React from 'react';
import { Play, RotateCcw, Settings2 } from 'lucide-react';

import { AtlasResolution } from '../types';
import { PackingAlgorithm } from '../utils/canvasUtils';

// Temporary definition if not in types yet (it is in canvasUtils, we should import or redefine)
// For simplicity assuming passed as string or we import. 
// Valid values: 'row' | 'grid' | 'maxrects'

type ImageModel = 'gemini' | 'flux';

interface Props {
  originalImageBase64: string;
  atlasImageBase64: string;
  onConfirm: () => void;
  onRetry: (res: AtlasResolution, algo: PackingAlgorithm, model: ImageModel) => void;
  isGenerating: boolean;
  currentResolution: AtlasResolution;
  currentAlgorithm: PackingAlgorithm;
  currentModel: ImageModel;
}

export const AtlasViewer: React.FC<Props> = ({
  originalImageBase64,
  atlasImageBase64,
  onConfirm,
  onRetry,
  isGenerating,
  currentResolution,
  currentAlgorithm,
  currentModel
}) => {

  const handleConfigChange = (
    key: 'resolution' | 'algorithm' | 'model',
    value: string | number
  ) => {
    const newRes = key === 'resolution' ? Number(value) as AtlasResolution : currentResolution;
    const newAlgo = key === 'algorithm' ? value as PackingAlgorithm : currentAlgorithm;
    const newModel = key === 'model' ? value as ImageModel : currentModel;

    // Trigger retry/update immediately when layout params change
    if (key !== 'model') {
      onRetry(newRes, newAlgo, newModel);
    } else {
      // For model, we might just want to update the parent state without re-generating atlas layout
      // But our onRetry contract updates everything. 
      // Ideally we separate "Layout Params" from "Generation Params".
      // But for "Recovering controls", updating state via onRetry is acceptable.
      onRetry(newRes, newAlgo, newModel);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-wrap gap-4 bg-slate-900/50 p-3 rounded-lg border border-slate-700 items-center text-sm">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-slate-400" />
          <span className="font-medium text-slate-300">Settings:</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-slate-400">Resolution:</label>
          <select
            value={currentResolution}
            onChange={(e) => handleConfigChange('resolution', e.target.value)}
            disabled={isGenerating}
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 outline-none focus:border-pink-500"
          >
            <option value={1024}>1024x1024</option>
            <option value={2048}>2048x2048</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-slate-400">Packing:</label>
          <select
            value={currentAlgorithm}
            onChange={(e) => handleConfigChange('algorithm', e.target.value)}
            disabled={isGenerating}
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 outline-none focus:border-pink-500"
          >
            <option value="row">Simple Row</option>
            <option value="grid">Grid</option>
            <option value="maxrects">MaxRects (Tight)</option>
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto border-l border-slate-700 pl-4">
          <label className="text-slate-400">Art Model:</label>
          <select
            value={currentModel}
            onChange={(e) => handleConfigChange('model', e.target.value)}
            disabled={isGenerating}
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 outline-none focus:border-cyan-500"
          >
            <option value="gemini">Gemini (nanobanana 2 pro)</option>
            <option value="flux">Flux2 pro</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-slate-900 group">
          <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs text-white z-10 font-mono">
            Original (Annotated)
          </div>
          {/* Allow basic zoom/pan or just containment? For now object-contain is fine. */}
          <img
            src={`data:image/png;base64,${originalImageBase64}`}
            alt="Original"
            className="w-full aspect-square object-contain bg-slate-800"
          />
        </div>
        <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-white group">
          <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs text-white z-10 font-mono">
            Atlas Layout
          </div>
          <img
            src={`data:image/png;base64,${atlasImageBase64}`}
            alt="Atlas Layout"
            className="w-full aspect-square object-contain"
          />
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-800 p-3 rounded text-sm text-blue-200 flex items-start gap-2">
        <div className="mt-0.5 min-w-[16px]"><Settings2 className="w-4 h-4" /></div>
        <div>
          Ready to generate art. The right view shows the {currentResolution}px texture atlas layout using the <strong>{currentAlgorithm}</strong> algorithm.
          <br />
          Selected Model: <strong>{currentModel.toUpperCase()}</strong>.
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => onRetry(currentResolution, currentAlgorithm, currentModel)}
          disabled={isGenerating}
          className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Refresh Layout
        </button>
        <button
          onClick={onConfirm}
          disabled={isGenerating}
          className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
        >
          {isGenerating ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating Art...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              Generate Assets
            </>
          )}
        </button>
      </div>
    </div>
  );
};