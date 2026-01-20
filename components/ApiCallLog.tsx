import React, { useState } from 'react';
import { Terminal, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { APICallLog } from '../types';

interface ApiCallLogProps {
    logs: APICallLog[];
    className?: string;
    compact?: boolean;
}

export const ApiCallLog: React.FC<ApiCallLogProps> = ({ logs, className, compact }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showFullPrompt, setShowFullPrompt] = useState<Record<string, boolean>>({});

    const formatJSON = (str: string): string => {
        try {
            return JSON.stringify(JSON.parse(str), null, 2);
        } catch {
            return str;
        }
    };

    if (logs.length === 0) {
        if (compact) return null;
        return (
            <div className={`bg-slate-900 rounded-lg border border-slate-700 p-4 text-center text-slate-500 text-sm ${className}`}>
                No API calls recorded.
            </div>
        );
    }

    return (
        <div className={`bg-slate-900 rounded-lg border border-slate-700 flex flex-col h-full ${className}`}>
            <div className="bg-slate-800 px-3 py-2 border-b border-slate-700 flex items-center gap-2 flex-shrink-0">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-400">API Logs</span>
                <span className="text-xs text-slate-500 ml-auto">{logs.length} calls</span>
            </div>

            <div className="divide-y divide-slate-800 overflow-y-auto flex-1 custom-scrollbar">
                {logs.map((log, i) => (
                    <div key={log.id} className="p-2">
                        <button
                            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                            className="w-full flex items-center gap-2 text-left hover:bg-slate-800/50 rounded p-1 transition-colors"
                        >
                            {expandedId === log.id ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${log.stage === 'director' ? 'bg-violet-500/20 text-violet-400' :
                                    log.stage === 'workers' ? 'bg-amber-500/20 text-amber-400' :
                                        'bg-emerald-500/20 text-emerald-400'
                                }`}>
                                {log.stage}
                            </span>
                            <span className="text-xs text-slate-400 truncate flex-1">
                                {/* Better label logic */}
                                {log.stage === 'workers' ? `Worker #${logs.filter((l, j) => l.stage === 'workers' && j < i).length + 1}` : `${log.stage}`}
                            </span>
                            <span className="text-xs text-slate-600">{log.duration}ms</span>
                        </button>

                        {expandedId === log.id && (
                            <div className="mt-2 space-y-3 pl-5 border-l-2 border-slate-800 ml-1">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Prompt</span>
                                        <button
                                            onClick={() => setShowFullPrompt(s => ({ ...s, [log.id]: !s[log.id] }))}
                                            className="text-xs text-blue-400 hover:text-blue-300"
                                        >
                                            {showFullPrompt[log.id] ? 'COLLAPSE' : 'EXPAND'}
                                        </button>
                                    </div>
                                    <pre className="text-[10px] text-slate-400 bg-slate-950 p-2 rounded max-h-64 overflow-auto whitespace-pre-wrap font-mono border border-slate-800 custom-scrollbar">
                                        {showFullPrompt[log.id] ? log.input.prompt : log.input.prompt.slice(0, 300) + (log.input.prompt.length > 300 ? '...' : '')}
                                    </pre>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-1">Output</div>
                                    <pre className="text-[10px] text-emerald-400 bg-slate-950 p-2 rounded max-h-64 overflow-auto whitespace-pre-wrap font-mono border border-slate-800 custom-scrollbar">
                                        {formatJSON(log.output)}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
