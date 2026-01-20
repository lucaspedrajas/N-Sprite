import React, { useMemo } from 'react';
import { GamePart, MovementType } from '../types';
import { CheckCircle, XCircle, AlertTriangle, GitBranch, RotateCcw, ArrowLeftRight, Circle, Zap } from 'lucide-react';

interface Props {
  parts: GamePart[];
  onValidationComplete?: (isValid: boolean, issues: ValidationIssue[]) => void;
}

interface ValidationIssue {
  type: 'error' | 'warning';
  partId: string;
  message: string;
}

interface HierarchyNode {
  part: GamePart;
  children: HierarchyNode[];
  depth: number;
}

const MOVEMENT_ICONS: Record<MovementType, React.ReactNode> = {
  ROTATION: <RotateCcw className="w-3 h-3" />,
  SLIDING: <ArrowLeftRight className="w-3 h-3" />,
  FIXED: <Circle className="w-3 h-3" />,
  ELASTIC: <Zap className="w-3 h-3" />,
};

const MOVEMENT_COLORS: Record<MovementType, string> = {
  ROTATION: 'text-blue-400',
  SLIDING: 'text-amber-400',
  FIXED: 'text-slate-400',
  ELASTIC: 'text-purple-400',
};

export const KinematicValidator: React.FC<Props> = ({ parts, onValidationComplete }) => {
  const validation = useMemo(() => {
    const issues: ValidationIssue[] = [];
    const partsById = new Map(parts.map(p => [p.id, p]));
    
    // Check 1: Validate parent references
    const rootParts: GamePart[] = [];
    parts.forEach(part => {
      if (!part.parentId) {
        rootParts.push(part);
      } else if (!partsById.has(part.parentId)) {
        issues.push({
          type: 'error',
          partId: part.id,
          message: `Parent "${part.parentId}" does not exist`
        });
      }
    });

    // Check 2: Ensure at least one root
    if (rootParts.length === 0 && parts.length > 0) {
      issues.push({
        type: 'error',
        partId: parts[0].id,
        message: 'No root part found (at least one part must have no parent)'
      });
    }

    // Check 3: Multiple roots warning
    if (rootParts.length > 1) {
      issues.push({
        type: 'warning',
        partId: rootParts[0].id,
        message: `Multiple root parts found (${rootParts.length}). Consider if this is intentional.`
      });
    }

    // Check 4: Circular dependency detection
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const detectCycle = (partId: string): boolean => {
      if (recursionStack.has(partId)) return true;
      if (visited.has(partId)) return false;
      
      visited.add(partId);
      recursionStack.add(partId);
      
      const part = partsById.get(partId) as GamePart | undefined;
      if (part?.parentId) {
        if (detectCycle(part.parentId)) {
          issues.push({
            type: 'error',
            partId: partId,
            message: `Circular dependency detected involving "${partId}"`
          });
          return true;
        }
      }
      
      recursionStack.delete(partId);
      return false;
    };
    
    parts.forEach(p => detectCycle(p.id));

    // Check 5: Validate bounding boxes
    parts.forEach(part => {
      const [minX, minY, maxX, maxY] = part.bbox;
      if (minX >= maxX || minY >= maxY) {
        issues.push({
          type: 'error',
          partId: part.id,
          message: `Invalid bounding box: min >= max`
        });
      }
      if (minX < 0 || minY < 0 || maxX > 1 || maxY > 1) {
        issues.push({
          type: 'warning',
          partId: part.id,
          message: `Bounding box extends outside image bounds (values clamped)`
        });
      }
    });

    // Check 6: Validate pivots are within bbox
    parts.forEach(part => {
      const [minX, minY, maxX, maxY] = part.bbox;
      const { x, y } = part.pivot;
      if (x < minX || x > maxX || y < minY || y > maxY) {
        issues.push({
          type: 'warning',
          partId: part.id,
          message: `Pivot point (${x.toFixed(2)}, ${y.toFixed(2)}) is outside bounding box`
        });
      }
    });

    // Check 7: ROTATION parts should have sensible pivot placement
    parts.forEach(part => {
      if (part.movementType === 'ROTATION') {
        const [minX, minY, maxX, maxY] = part.bbox;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const distFromCenter = Math.sqrt(
          Math.pow(part.pivot.x - centerX, 2) + 
          Math.pow(part.pivot.y - centerY, 2)
        );
        const bboxDiagonal = Math.sqrt(
          Math.pow(maxX - minX, 2) + 
          Math.pow(maxY - minY, 2)
        );
        // Pivot very far from center for rotation might be intentional but worth noting
        if (distFromCenter > bboxDiagonal * 0.6) {
          issues.push({
            type: 'warning',
            partId: part.id,
            message: `Rotation pivot is far from part center - verify this is intentional`
          });
        }
      }
    });

    // Build hierarchy tree
    const buildTree = (parentId: string | null, depth: number): HierarchyNode[] => {
      return parts
        .filter(p => p.parentId === parentId)
        .map(part => ({
          part,
          children: buildTree(part.id, depth + 1),
          depth
        }));
    };
    
    const hierarchyTree = buildTree(null, 0);
    const isValid = issues.filter(i => i.type === 'error').length === 0;

    // Notify parent
    if (onValidationComplete) {
      onValidationComplete(isValid, issues);
    }

    return { issues, hierarchyTree, isValid, rootParts };
  }, [parts, onValidationComplete]);

  const renderNode = (node: HierarchyNode): React.ReactNode => {
    const hasErrors = validation.issues.some(i => i.partId === node.part.id && i.type === 'error');
    const hasWarnings = validation.issues.some(i => i.partId === node.part.id && i.type === 'warning');
    
    return (
      <div key={node.part.id} className="ml-4">
        <div className={`flex items-center gap-2 py-1 px-2 rounded ${hasErrors ? 'bg-red-500/10' : hasWarnings ? 'bg-amber-500/10' : 'bg-slate-800/50'}`}>
          <div className={`${MOVEMENT_COLORS[node.part.movementType]}`}>
            {MOVEMENT_ICONS[node.part.movementType]}
          </div>
          <span className="text-sm text-slate-300">{node.part.name}</span>
          <span className="text-xs text-slate-500 font-mono">{node.part.id}</span>
          {hasErrors && <XCircle className="w-3 h-3 text-red-400 ml-auto" />}
          {!hasErrors && hasWarnings && <AlertTriangle className="w-3 h-3 text-amber-400 ml-auto" />}
          {!hasErrors && !hasWarnings && <CheckCircle className="w-3 h-3 text-emerald-400 ml-auto" />}
        </div>
        {node.children.length > 0 && (
          <div className="border-l border-slate-700 ml-2">
            {node.children.map(child => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  const errorCount = validation.issues.filter(i => i.type === 'error').length;
  const warningCount = validation.issues.filter(i => i.type === 'warning').length;

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="flex items-center gap-3 mb-4">
        <GitBranch className="w-5 h-5 text-indigo-400" />
        <h3 className="text-lg font-semibold text-white">Kinematic Validation</h3>
        <div className="ml-auto flex items-center gap-3">
          {validation.isValid ? (
            <span className="flex items-center gap-1 text-sm text-emerald-400">
              <CheckCircle className="w-4 h-4" /> Valid
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm text-red-400">
              <XCircle className="w-4 h-4" /> {errorCount} Error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-sm text-amber-400">
              <AlertTriangle className="w-4 h-4" /> {warningCount} Warning{warningCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Hierarchy Tree */}
      <div className="mb-4">
        <h4 className="text-xs text-slate-500 uppercase font-bold mb-2">Hierarchy Tree</h4>
        <div className="bg-slate-900 rounded-lg p-3 max-h-64 overflow-y-auto">
          {validation.hierarchyTree.length > 0 ? (
            validation.hierarchyTree.map(node => renderNode(node))
          ) : (
            <p className="text-sm text-slate-500">No parts to display</p>
          )}
        </div>
      </div>

      {/* Issues List */}
      {validation.issues.length > 0 && (
        <div>
          <h4 className="text-xs text-slate-500 uppercase font-bold mb-2">Issues</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {validation.issues.map((issue, i) => (
              <div 
                key={i} 
                className={`flex items-start gap-2 p-2 rounded text-sm ${
                  issue.type === 'error' ? 'bg-red-500/10 border border-red-500/30' : 'bg-amber-500/10 border border-amber-500/30'
                }`}
              >
                {issue.type === 'error' ? (
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-mono text-xs text-slate-400">{issue.partId}:</span>
                  <span className={`ml-2 ${issue.type === 'error' ? 'text-red-300' : 'text-amber-300'}`}>
                    {issue.message}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-slate-700">
        <h4 className="text-xs text-slate-500 uppercase font-bold mb-2">Movement Types</h4>
        <div className="flex flex-wrap gap-4 text-xs">
          {Object.entries(MOVEMENT_ICONS).map(([type, icon]) => (
            <div key={type} className={`flex items-center gap-1 ${MOVEMENT_COLORS[type as MovementType]}`}>
              {icon}
              <span>{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
