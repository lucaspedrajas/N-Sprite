import React from 'react';
import { GamePart, MOVEMENT_LABELS } from '../types';
import { CheckCircle, AlertCircle, Play, GitBranch } from 'lucide-react';

interface Props {
  parts: GamePart[];
  onConfirm: () => void;
  onRetry: () => void;
}

interface TreeNode {
  part: GamePart;
  children: TreeNode[];
}

const buildTree = (parts: GamePart[]): TreeNode[] => {
  const partMap = new Map<string, GamePart>();
  parts.forEach(p => partMap.set(p.id, p));
  
  const childrenMap = new Map<string | null, GamePart[]>();
  parts.forEach(p => {
    const parentKey = p.parentId;
    if (!childrenMap.has(parentKey)) {
      childrenMap.set(parentKey, []);
    }
    childrenMap.get(parentKey)!.push(p);
  });
  
  const buildNode = (part: GamePart): TreeNode => ({
    part,
    children: (childrenMap.get(part.id) || []).map(buildNode)
  });
  
  const roots = childrenMap.get(null) || [];
  return roots.map(buildNode);
};

const TreeNodeComponent: React.FC<{ node: TreeNode; isLast: boolean }> = ({ node, isLast }) => {
  const hasChildren = node.children.length > 0;
  
  return (
    <div className="flex flex-col items-center">
      {/* Node box */}
      <div className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-center min-w-[120px] shadow-lg hover:border-indigo-500 transition-colors">
        <div className="font-medium text-indigo-300 text-sm">{node.part.name}</div>
        <div className="text-xs text-slate-400 mt-0.5">{MOVEMENT_LABELS[node.part.movementType]}</div>
      </div>
      
      {/* Vertical line down to children */}
      {hasChildren && (
        <div className="w-px h-4 bg-slate-500" />
      )}
      
      {/* Children container */}
      {hasChildren && (
        <div className="relative flex gap-4">
          {/* Horizontal connector line */}
          {node.children.length > 1 && (
            <div 
              className="absolute top-0 h-px bg-slate-500"
              style={{
                left: '50%',
                right: '50%',
                marginLeft: `calc(-${(node.children.length - 1) * 50}% - ${(node.children.length - 1) * 8}px)`,
                marginRight: `calc(-${(node.children.length - 1) * 50}% - ${(node.children.length - 1) * 8}px)`,
              }}
            />
          )}
          
          {node.children.map((child, idx) => (
            <div key={child.part.id} className="flex flex-col items-center">
              {/* Vertical line from horizontal connector to child */}
              <div className="w-px h-4 bg-slate-500" />
              <TreeNodeComponent node={child} isLast={idx === node.children.length - 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const HierarchyTree: React.FC<{ parts: GamePart[] }> = ({ parts }) => {
  const tree = buildTree(parts);
  
  if (tree.length === 0) {
    return <div className="text-slate-400 text-sm text-center py-4">No hierarchy detected</div>;
  }
  
  return (
    <div className="flex justify-center gap-8 overflow-x-auto pb-2">
      {tree.map((rootNode, idx) => (
        <TreeNodeComponent key={rootNode.part.id} node={rootNode} isLast={idx === tree.length - 1} />
      ))}
    </div>
  );
};

export const AnalysisViewer: React.FC<Props> = ({ parts, onConfirm, onRetry }) => {
  return (
    <div className="space-y-4">
      {/* Hierarchy Tree Diagram */}
      <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
        <h3 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-indigo-400" />
          Part Hierarchy
        </h3>
        <div className="overflow-x-auto custom-scrollbar">
          <div className="min-w-fit py-2">
            <HierarchyTree parts={parts} />
          </div>
        </div>
      </div>

      {/* Parts List */}
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
                  {part.confidence !== undefined && ` | Conf: ${Math.round(part.confidence * 100)}%`}
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