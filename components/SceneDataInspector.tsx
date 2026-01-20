import React, { useState } from 'react';
import { GamePart, MOVEMENT_LABELS, TYPE_HINT_LABELS } from '../types';
import { useSceneGraph, TreeNode } from '../hooks/useSceneGraph';
import { useKinematics } from '../hooks/useKinematics';
import { GitBranch, AlertTriangle, CheckCircle, XCircle, Info, Layers } from 'lucide-react';

interface InspectorProps {
    parts: GamePart[];
    compact?: boolean;
}

export const SceneDataInspector: React.FC<InspectorProps> = ({ parts, compact }) => {
    const { tree, partMap } = useSceneGraph(parts);
    const { issues, isValid, rootParts } = useKinematics(parts);
    const [activeTab, setActiveTab] = useState<'hierarchy' | 'validation'>('hierarchy');

    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;

    return (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden flex flex-col h-full">
            {/* Header Tabs */}
            <div className="flex border-b border-slate-700 bg-slate-900/50">
                <button
                    onClick={() => setActiveTab('hierarchy')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'hierarchy'
                        ? 'border-indigo-500 text-indigo-400 bg-slate-800'
                        : 'border-transparent text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
                        }`}
                >
                    <GitBranch size={16} />
                    Hierarchy
                </button>
                <button
                    onClick={() => setActiveTab('validation')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'validation'
                        ? 'border-indigo-500 text-indigo-400 bg-slate-800'
                        : 'border-transparent text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
                        }`}
                >
                    {errorCount > 0 ? (
                        <XCircle size={16} className="text-red-400" />
                    ) : warningCount > 0 ? (
                        <AlertTriangle size={16} className="text-amber-400" />
                    ) : (
                        <CheckCircle size={16} className="text-emerald-400" />
                    )}
                    Validation
                    {(errorCount > 0 || warningCount > 0) && (
                        <span className="ml-1 px-1.5 py-0.5 bg-slate-700 rounded-full text-xs text-slate-300">
                            {errorCount + warningCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Content Area */}
            <div className="p-4 overflow-y-auto min-h-[300px] custom-scrollbar">
                {activeTab === 'hierarchy' ? (
                    <HierarchyView tree={tree} partMap={partMap} />
                ) : (
                    <ValidationView issues={issues} isValid={isValid} rootParts={rootParts} />
                )}
            </div>
        </div>
    );
};

// --- Sub-components for Hierarchy View ---

const HierarchyView: React.FC<{ tree: TreeNode[], partMap: Map<string, GamePart> }> = ({ tree }) => {
    if (tree.length === 0) return <div className="text-center text-slate-500 py-8">No parts found.</div>;

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                <div className="flex flex-col gap-1">
                    {tree.map((root) => (
                        <HierarchyNode key={root.part.id} node={root} level={0} />
                    ))}
                </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-700">
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Rotation</div>
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div> Sliding</div>
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div> Fixed</div>
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div> Elastic</div>
                </div>
            </div>
        </div>
    );
};

const HierarchyNode: React.FC<{ node: TreeNode; level: number }> = ({ node, level }) => {
    // Movement type indicator color
    const typeColor = {
        'ROTATION': 'bg-blue-400',
        'SLIDING': 'bg-amber-400',
        'FIXED': 'bg-slate-400',
        'ELASTIC': 'bg-purple-400'
    }[node.part.movementType] || 'bg-slate-500';

    return (
        <div className="flex flex-col">
            <div
                className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors group"
                style={{ marginLeft: `${level * 12}px` }}
            >
                {/* Tree Line Connector (visual only) */}
                {level > 0 && <span className="text-slate-600 mr-1">└</span>}

                {/* Movement Type Dot */}
                <div className={`w-2 h-2 rounded-full ${typeColor} shadow-[0_0_8px_rgba(0,0,0,0.5)]`} title={node.part.movementType} />

                {/* Content */}
                <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-200 font-medium truncate group-hover:text-white leading-tight">
                        {node.part.name}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate uppercase">
                        {node.part.type_hint}
                    </div>
                </div>
            </div>

            {/* Recursion */}
            {node.children.length > 0 && (
                <div className="flex flex-col gap-1 mt-1 border-l border-slate-700/50 ml-2 pl-1 mb-1">
                    {node.children.map((child) => (
                        <HierarchyNode key={child.part.id} node={child} level={level + 1} />
                    ))}
                </div>
            )}
        </div>
    );
};


// --- Sub-components for Validation View ---

const ValidationView: React.FC<{ issues: any[], isValid: boolean, rootParts: GamePart[] }> = ({ issues, isValid, rootParts }) => {
    return (
        <div className="space-y-6">
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                <h4 className="text-sm font-semibold text-slate-200 mb-2">Summary</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-800 p-3 rounded border border-slate-700">
                        <div className="text-xs text-slate-400">Root Parts</div>
                        <div className="text-xl font-mono text-white">{rootParts.length}</div>
                    </div>
                    <div className="bg-slate-800 p-3 rounded border border-slate-700">
                        <div className="text-xs text-slate-400">Status</div>
                        <div className={`text-xl font-medium ${isValid ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isValid ? 'Ready' : 'Issues Found'}
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <h4 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <Info size={16} /> Analysis Report
                </h4>

                {issues.length === 0 ? (
                    <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-lg text-emerald-400">
                        <CheckCircle size={20} />
                        <span>All checks passed. The rig structure is valid.</span>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {issues.map((issue, i) => (
                            <div
                                key={i}
                                className={`
                            flex items-start gap-3 p-3 rounded-lg border text-sm
                            ${issue.type === 'error'
                                        ? 'bg-red-500/10 border-red-500/30 text-red-200'
                                        : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                                    }
                        `}
                            >
                                {issue.type === 'error' ? (
                                    <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                                ) : (
                                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                                )}
                                <div>
                                    <div className="font-mono text-xs opacity-70 mb-1">PART ID: {issue.partId}</div>
                                    <div>{issue.message}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
