import React from 'react';
import { FileText, Cpu, Layers, Image as ImageIcon, GitFork } from 'lucide-react';

export const Whitepaper: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto bg-white text-slate-900 p-8 md:p-12 rounded-lg shadow-xl font-serif">
      <div className="text-center border-b-2 border-slate-900 pb-8 mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">
          Neural Sprite Pipeline
        </h1>
        <h2 className="text-xl text-slate-700 font-medium">
          Automated Decomposition & Reconstruction for 2D Rigged Game Assets
        </h2>
        <div className="text-slate-500 italic mt-4">
          Technical Report v2.0 • Polygon Mask Architecture
        </div>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
            <FileText className="w-5 h-5" /> Abstract
          </h2>
          <p className="leading-relaxed text-justify text-slate-700">
            This paper introduces the <strong>Neural Sprite Pipeline</strong>, an automated workflow for converting static 2D concept art into rigged, articulated game assets. 
            By leveraging Multimodal Large Language Models (MLLMs) for structural inference and Generative Image Models for in-painting, we demonstrate a method to deconstruct single-view images into logically segmented parts using polygon masks, reconstruct occluded areas, and generate automated kinematic rigs. Input images are normalized to 1024×1024 resolution for consistent coordinate space. The current implementation utilizes Google's Gemini family of models, but the architecture is designed to be model-agnostic.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
            <Cpu className="w-5 h-5" /> I. Methodology
          </h2>
          
          <div className="pl-4 border-l-4 border-slate-200 space-y-6">
            <div>
              <h3 className="font-bold text-lg mb-2">A. Image Normalization</h3>
              <p className="text-slate-700 mb-2">
                Input images are first normalized to a 1024×1024 pixel canvas with a white background. 
                The original image is scaled to fit while preserving aspect ratio, then centered. This ensures consistent coordinate space for all subsequent operations.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">B. Semantic Decomposition (Structural Inference)</h3>
              <p className="text-slate-700 mb-2">
                The normalized image is analyzed by a Vision-Language Model to identify functional sub-components (e.g., wheels, chassis, limbs). 
                The model outputs a structured JSON schema defining:
              </p>
              <ul className="list-disc list-inside text-sm text-slate-600 ml-4">
                <li>Hierarchical relationships (Parent/Child nodes)</li>
                <li>Polygon masks (4-6 vertex outlines in pixel coordinates)</li>
                <li>Inferred movement types (Rotation, Translation, Pulse)</li>
                <li>Pivot points in world pixel coordinates</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">C. Atlas Layout Optimization</h3>
              <p className="text-slate-700">
                A deterministic packing algorithm (row, grid, or maxrects) calculates the optimal layout for a square texture atlas (1K/2K). 
                The polygon masks are scaled and transformed to their target positions, creating a visual "blueprint" that preserves each part's shape for the generative phase.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">D. Generative Reconstruction (Image Synthesis)</h3>
              <p className="text-slate-700">
                A dual-input prompt strategy is employed. We feed the generative model:
                <br/>1) The original reference image with annotated polygon masks.
                <br/>2) The atlas layout template with scaled polygon outlines.
                <br/>
                The model is instructed to extract and generate pixel data for each part within its polygon boundary. Crucially, it must reconstruct areas that were occluded in the original image (e.g., the top of a tire hidden by a fender) to ensure clean rotation during animation.
              </p>
            </div>
          </div>
        </section>

        <section>
            <h2 className="text-xl font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                <Layers className="w-5 h-5" /> II. Architecture
            </h2>
            <div className="bg-slate-100 p-6 rounded-lg text-sm font-mono text-slate-700">
                [Input Image] <br/>
                &nbsp;&nbsp;⬇<br/>
                [Normalize] - (Fit to 1024×1024 white canvas)<br/>
                &nbsp;&nbsp;⬇<br/>
                [Vision Model] - (JSON: Polygon Masks, Pivots & Hierarchy)<br/>
                &nbsp;&nbsp;⬇<br/>
                [Canvas Engine] - (Atlas Template with Scaled Polygons)<br/>
                &nbsp;&nbsp;⬇<br/>
                [Image Gen Model] - (Prompt: "Ref[polygon] → Target[polygon]")<br/>
                &nbsp;&nbsp;⬇<br/>
                [Output Sprite Sheet] + [Animation Rig]
            </div>
        </section>

        <section>
          <h2 className="text-xl font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
            <GitFork className="w-5 h-5" /> III. Future Work
          </h2>
          <p className="text-slate-700">
            Current limitations include complex skeletal chain inference and multi-view consistency. 
            Future iterations will explore larger reasoning models for improved polygon accuracy, depth-map estimation for automated Z-indexing (layer ordering), 
            and support for higher-vertex polygon masks to capture more complex part geometries.
          </p>
        </section>

        <div className="border-t border-slate-200 pt-8 mt-8 text-center text-xs text-slate-500">
            Neural Sprite Pipeline Research Prototype • React + GenAI SDK
        </div>
      </div>
    </div>
  );
};