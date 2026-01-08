import React from 'react';
import { GamePart, MOVEMENT_LABELS } from '../types';
import { CheckCircle, AlertCircle, Play } from 'lucide-react';

interface Props {
  parts: GamePart[];
  onConfirm: () => void;
  onRetry: () => void;
}

export const AnalysisViewer: React.FC<Props> = ({ parts, onConfirm, onRetry }) => {
  return (
    <div className="space-y-4">
      <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
        <h3 className="text-lg font-semibold text-slate-200 mb-2 flex items-center gap-2">
           <CheckCircle className="w-5 h-5 text-emerald-400" />
           Analysis Complete
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          The AI identified {parts.length} distinct parts. Review the hierarchy and detected types below.
        </p>
        
        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
          {parts.map((part) => (
            <div key={part.id} className="flex items-center justify-between bg-slate-700 p-2 rounded text-sm">
              <div className="flex flex-col">
                <span className="font-medium text-indigo-300">{part.name}</span>
                <span className="text-xs text-slate-400">
                  Parent: {part.parentId || "Root"} | Move: {MOVEMENT_LABELS[part.movementType]}
                </span>
              </div>
              <div className="text-xs bg-slate-900 px-2 py-1 rounded text-slate-500 font-mono">
                ID: {part.id}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors flex items-center justify-center gap-2"
        >
          <AlertCircle className="w-4 h-4" />
          Retry Analysis
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4 fill-current" />
          Prepare Atlas
        </button>
      </div>
    </div>
  );
};