# Neural Sprite Pipeline

## Automated Decomposition & Reconstruction for 2D Rigged Game Assets

*Technical Report v2.0 • Polygon Mask Architecture*

---

## Abstract

This paper introduces the **Neural Sprite Pipeline**, an automated workflow for converting static 2D concept art into rigged, articulated game assets. By leveraging Multimodal Large Language Models (MLLMs) for structural inference and Generative Image Models for in-painting, we demonstrate a method to deconstruct single-view images into logically segmented parts using polygon masks, reconstruct occluded areas, and generate automated kinematic rigs. Input images are normalized to 1024×1024 resolution for consistent coordinate space. The current implementation utilizes Google's Gemini family of models, but the architecture is designed to be model-agnostic.

---

## I. Methodology

### A. Image Normalization

Input images are first normalized to a 1024×1024 pixel canvas with a white background. The original image is scaled to fit while preserving aspect ratio, then centered. This ensures consistent coordinate space for all subsequent operations.

### B. Semantic Decomposition (Structural Inference)

The normalized image is analyzed by a Vision-Language Model to identify functional sub-components (e.g., wheels, chassis, limbs). The model outputs a structured JSON schema defining:

- **Hierarchical relationships** (Parent/Child nodes)
- **Polygon masks** (4-6 vertex outlines in pixel coordinates)
- **Inferred movement types** (Rotation, Translation, Pulse)
- **Pivot points** in world pixel coordinates

### C. Atlas Layout Optimization

A deterministic packing algorithm (row, grid, or maxrects) calculates the optimal layout for a square texture atlas (1K/2K). The polygon masks are scaled and transformed to their target positions, creating a visual "blueprint" that preserves each part's shape for the generative phase.

### D. Generative Reconstruction (Image Synthesis)

A dual-input prompt strategy is employed. We feed the generative model:

1. The original reference image with annotated polygon masks.
2. The atlas layout template with scaled polygon outlines.

The model is instructed to extract and generate pixel data for each part within its polygon boundary. Crucially, it must reconstruct areas that were occluded in the original image (e.g., the top of a tire hidden by a fender) to ensure clean rotation during animation.

---

## II. Architecture

```
[Input Image]
    ⬇
[Normalize] - (Fit to 1024×1024 white canvas)
    ⬇
[Vision Model] - (JSON: Polygon Masks, Pivots & Hierarchy)
    ⬇
[Canvas Engine] - (Atlas Template with Scaled Polygons)
    ⬇
[Image Gen Model] - (Prompt: "Ref[polygon] → Target[polygon]")
    ⬇
[Output Sprite Sheet] + [Animation Rig]
```

---

## III. Data Schema

### GamePart Interface

```typescript
interface Point {
  x: number;
  y: number;
}

interface PartMask {
  polygon: Point[];  // 4-6 vertices defining the mask
}

interface GamePart {
  id: string;
  name: string;
  parentId: string | null;
  mask: PartMask;
  pivot: Point;  // World pixel coordinates
  movementType: 'ROTATION' | 'TRANSLATION_HORIZONTAL' | 'TRANSLATION_VERTICAL' | 'STATIC' | 'SCALE_PULSE';
  atlasRect?: Rect;
}
```

---

## IV. Future Work

Current limitations include complex skeletal chain inference and multi-view consistency. Future iterations will explore:

- Larger reasoning models for improved polygon accuracy
- Depth-map estimation for automated Z-indexing (layer ordering)
- Support for higher-vertex polygon masks to capture more complex part geometries
- Multi-view input for 3D-aware decomposition

---

*Neural Sprite Pipeline Research Prototype • React + GenAI SDK*
