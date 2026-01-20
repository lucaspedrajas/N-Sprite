import { useMemo } from 'react';
import { GamePart } from '../types';

export interface ValidationIssue {
    type: 'error' | 'warning';
    partId: string;
    message: string;
}

export interface ValidationResult {
    isValid: boolean;
    issues: ValidationIssue[];
    rootParts: GamePart[];
}

export const useKinematics = (parts: GamePart[]): ValidationResult => {
    return useMemo(() => {
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
            // Allow small tolerance or check strictly? Sticking to strict for now but warning only.
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

        const isValid = issues.filter(i => i.type === 'error').length === 0;

        return { issues, isValid, rootParts };
    }, [parts]);
};
