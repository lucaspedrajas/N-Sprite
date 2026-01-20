import { useMemo } from 'react';
import { GamePart } from '../types';

export interface TreeNode {
    part: GamePart;
    children: TreeNode[];
}

export interface SceneGraph {
    partMap: Map<string, GamePart>;
    childrenMap: Map<string | null, GamePart[]>;
    tree: TreeNode[];
    rootParts: GamePart[];
}

export const useSceneGraph = (parts: GamePart[]): SceneGraph => {
    return useMemo(() => {
        const partMap = new Map<string, GamePart>();
        parts.forEach(p => partMap.set(p.id, p));

        const childrenMap = new Map<string | null, GamePart[]>();
        parts.forEach(p => {
            const parentKey = p.parentId || null;
            if (!childrenMap.has(parentKey)) {
                childrenMap.set(parentKey, []);
            }
            childrenMap.get(parentKey)!.push(p);
        });

        const buildNode = (part: GamePart): TreeNode => ({
            part,
            children: (childrenMap.get(part.id) || []).map(buildNode)
        });

        const rootParts = childrenMap.get(null) || [];
        // Sort roots by size (area) descending, common for rendering order
        rootParts.sort((a, b) => {
            const areaA = (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]);
            const areaB = (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]);
            return areaB - areaA;
        });

        const tree = rootParts.map(buildNode);

        return { partMap, childrenMap, tree, rootParts };
    }, [parts]);
};
