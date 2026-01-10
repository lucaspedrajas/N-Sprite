import React, { useRef } from 'react';
import { FileText, Cpu, Layers, Image as ImageIcon, GitFork, Workflow, ArrowDown, CheckCircle, Circle, Download, FileDown, Play } from 'lucide-react';
import { GamePart } from '../types';
import html2canvas from 'html2canvas';

interface PipelineState {
  originalImage: string | null;
  annotatedOriginalImage: string | null;
  preparedAtlasImage: string | null;
  generatedAtlasImage: string | null;
  analysisResults: GamePart[] | null;
  isValidated: boolean;
}

interface Props {
  pipelineState?: PipelineState;
}

const PipelineArrow: React.FC<{ active: boolean }> = ({ active }) => (
  <div className={`flex flex-col items-center ${active ? 'text-blue-500' : 'text-slate-300'}`}>
    <div className={`w-0.5 h-4 ${active ? 'bg-blue-500' : 'bg-slate-300'}`} />
    <ArrowDown className="w-4 h-4" />
  </div>
);

interface PipelineNodeProps {
  label: string;
  description: string;
  image?: string | null;
  isComplete: boolean;
  metadata?: React.ReactNode;
}

const PipelineNode: React.FC<PipelineNodeProps> = ({ label, description, image, isComplete, metadata }) => (
  <div className={`w-full max-w-md border rounded-lg overflow-hidden transition-all ${
    isComplete ? 'border-blue-400 bg-white shadow-md' : 'border-slate-200 bg-slate-50'
  }`}>
    <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50">
      {isComplete ? (
        <CheckCircle className="w-4 h-4 text-emerald-500" />
      ) : (
        <Circle className="w-4 h-4 text-slate-300" />
      )}
      <span className="font-semibold text-sm text-slate-800">{label}</span>
      <span className="text-xs text-slate-500 ml-auto">{description}</span>
    </div>
    {image ? (
      <div className="p-2 bg-slate-100">
        <img 
          src={`data:image/png;base64,${image}`} 
          alt={label}
          className="w-full h-32 object-contain bg-white rounded border border-slate-200"
        />
        {metadata}
      </div>
    ) : (
      <div className="p-4 text-center text-slate-400 text-sm italic">
        Pending...
      </div>
    )}
  </div>
);

export const Whitepaper: React.FC<Props> = ({ pipelineState }) => {
  const whitepaperRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<HTMLDivElement>(null);

  const hasAnyResult = pipelineState && (
    pipelineState.originalImage || 
    pipelineState.annotatedOriginalImage || 
    pipelineState.preparedAtlasImage || 
    pipelineState.generatedAtlasImage
  );

  const exportPipelineAsImage = async () => {
    if (!pipelineRef.current) return;
    try {
      const canvas = await html2canvas(pipelineRef.current, {
        backgroundColor: '#f8fafc',
        scale: 2,
      });
      const link = document.createElement('a');
      link.download = 'pipeline-visualization.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Failed to export pipeline image:', err);
    }
  };

  const exportAsPdf = () => {
    window.print();
  };
  return (
    <div ref={whitepaperRef} className="max-w-4xl mx-auto bg-white text-slate-900 p-8 md:p-12 rounded-lg shadow-xl font-serif print:shadow-none print:p-4">
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

        <section>
          <h2 className="text-xl font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
            <Workflow className="w-5 h-5" /> IV. Live Pipeline Visualization
          </h2>
          {hasAnyResult ? (
            <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
              <p className="text-sm text-slate-600 mb-4 text-center italic">
                Real-time visualization of pipeline artifacts from the current session.
              </p>
              
              {/* Export buttons */}
              <div className="flex justify-center gap-3 mb-6 print:hidden">
                <button
                  onClick={exportPipelineAsImage}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export Diagram as PNG
                </button>
                <button
                  onClick={exportAsPdf}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <FileDown className="w-4 h-4" />
                  Export Whitepaper as PDF
                </button>
              </div>
              
              <div ref={pipelineRef} className="flex flex-col items-center gap-2 bg-slate-50 p-4 rounded-lg">
                {/* Step 1: Input */}
                <PipelineNode 
                  label="1. Source Input" 
                  description="Normalized 1024×1024"
                  image={pipelineState?.originalImage}
                  isComplete={!!pipelineState?.originalImage}
                />
                
                <PipelineArrow active={!!pipelineState?.originalImage} />
                
                {/* Step 2: Analysis */}
                <PipelineNode 
                  label="2. Semantic Analysis" 
                  description={pipelineState?.analysisResults ? `${pipelineState.analysisResults.length} parts detected` : 'Awaiting analysis'}
                  image={pipelineState?.annotatedOriginalImage}
                  isComplete={!!pipelineState?.analysisResults}
                  metadata={pipelineState?.analysisResults ? (
                    <div className="text-xs text-slate-500 mt-1">
                      Parts: {pipelineState.analysisResults.map(p => p.name).join(', ')}
                    </div>
                  ) : undefined}
                />
                
                <PipelineArrow active={!!pipelineState?.annotatedOriginalImage} />
                
                {/* Step 3: Atlas Layout */}
                <PipelineNode 
                  label="3. Atlas Template" 
                  description="Optimized packing layout"
                  image={pipelineState?.preparedAtlasImage}
                  isComplete={!!pipelineState?.preparedAtlasImage}
                />
                
                <PipelineArrow active={!!pipelineState?.preparedAtlasImage} />
                
                {/* Step 4: Generated Output */}
                <PipelineNode 
                  label="4. Generated Atlas" 
                  description="Reconstructed sprite sheet"
                  image={pipelineState?.generatedAtlasImage}
                  isComplete={!!pipelineState?.generatedAtlasImage}
                />
                
                <PipelineArrow active={!!pipelineState?.generatedAtlasImage} />
                
                {/* Step 5: Kinematic Validation */}
                <div className={`w-full max-w-md border rounded-lg overflow-hidden transition-all ${
                  pipelineState?.isValidated ? 'border-emerald-400 bg-white shadow-md' : 'border-slate-200 bg-slate-50'
                }`}>
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50">
                    {pipelineState?.isValidated ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-300" />
                    )}
                    <span className="font-semibold text-sm text-slate-800">5. Kinematic Validation</span>
                    <span className="text-xs text-slate-500 ml-auto">Animation preview</span>
                  </div>
                  <div className="p-4 flex items-center justify-center gap-3">
                    <Play className={`w-6 h-6 ${pipelineState?.isValidated ? 'text-emerald-500' : 'text-slate-300'}`} />
                    <span className={`text-sm ${pipelineState?.isValidated ? 'text-emerald-600 font-medium' : 'text-slate-400 italic'}`}>
                      {pipelineState?.isValidated ? 'Rig validated & ready for export' : 'Pending validation...'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-100 p-8 rounded-lg text-center">
              <div className="text-slate-400 mb-2">
                <Workflow className="w-12 h-12 mx-auto opacity-50" />
              </div>
              <p className="text-slate-500 text-sm">
                No pipeline data available yet. Process an image in the Experiment tab to see the live visualization.
              </p>
            </div>
          )}
        </section>

        <div className="border-t border-slate-200 pt-8 mt-8 text-center text-xs text-slate-500">
            Neural Sprite Pipeline Research Prototype • React + GenAI SDK
        </div>
      </div>
    </div>
  );
};