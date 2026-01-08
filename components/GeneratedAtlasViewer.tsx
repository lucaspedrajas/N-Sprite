import React from 'react';
import { Play, RefreshCw, Check } from 'lucide-react';

interface Props {
  imageBase64: string;
  onConfirm: () => void;
  onRetry: () => void;
}

export const GeneratedAtlasViewer: React.FC<Props> = ({ imageBase64, onConfirm, onRetry }) => {
  return (
    <div className="space-y-4">
      <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-slate-900 aspect-video group">
        <img 
          src={`data:image/png;base64,${imageBase64}`} 
          alt="Generated Atlas" 
          className="w-full h-full object-contain"
        />
        <div className="absolute top-2 left-2 bg-emerald-600/90 px-2 py-1 rounded text-xs text-white flex items-center gap-1 shadow-lg">
          <Check className="w-3 h-3" /> Generated Result
        </div>
      </div>

      <div className="bg-slate-700/30 p-3 rounded-lg border border-slate-700/50 text-sm text-slate-300">
        <p>The model has filled the sprite sheet. Review the art quality before proceeding to rigging.</p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors flex items-center justify-center gap-2 border border-slate-600"
        >
          <RefreshCw className="w-4 h-4" />
          Regenerate Art
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
        >
          <Play className="w-4 h-4 fill-current" />
          Preview Animation
        </button>
      </div>
    </div>
  );
};