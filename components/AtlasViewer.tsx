import React from 'react';
import { Play, RotateCcw } from 'lucide-react';

interface Props {
  originalImageBase64: string;
  atlasImageBase64: string;
  onConfirm: () => void;
  onRetry: () => void;
  isGenerating: boolean;
}

export const AtlasViewer: React.FC<Props> = ({ originalImageBase64, atlasImageBase64, onConfirm, onRetry, isGenerating }) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
          <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs text-white z-10">
            Original
          </div>
          <img 
            src={`data:image/png;base64,${originalImageBase64}`} 
            alt="Original" 
            className="w-full aspect-square object-contain bg-slate-800"
          />
        </div>
        <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-white">
          <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs text-white z-10">
            Atlas Layout
          </div>
          <img 
            src={`data:image/png;base64,${atlasImageBase64}`} 
            alt="Atlas Layout" 
            className="w-full aspect-square object-contain"
          />
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-800 p-3 rounded text-sm text-blue-200">
        Ready for generation. The right side contains empty slots mapped to the identified parts. 
        The AI model will be prompted to fill these slots with asset art.
      </div>

      <div className="flex gap-3">
        <button
          onClick={onRetry}
          disabled={isGenerating}
          className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Redo Layout
        </button>
        <button
          onClick={onConfirm}
          disabled={isGenerating}
          className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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