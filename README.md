# Neural Sprite Pipeline 🛠️✨

**Neural Sprite Pipeline** is an experimental research tool designed for game developers and artists to transform static concept art into production-ready, modular game assets.

Using a **Sequential Multi-Persona Workflow**, it combines the reasoning power of **Gemini 3 Flash** with the precision of **SAM3** to decompose objects into logical moving parts, generate high-fidelity textures (reconstructing occluded areas), and provide an instant rig preview.

## 🎬 Demo Videos

<table>
  <tr>
    <td><video src="https://github.com/user-attachments/assets/7fbc0d76-2148-4781-a1b4-9114787ca784" width="100%"></video></td>
    <td><video src="https://github.com/user-attachments/assets/725b0ad3-bd29-4280-8f39-c1d444a489c2" width="100%"></video></td>
  </tr>
</table>

## 🚀 Key Features v3.0

- **Hybrid Segmentation**: Dynamically chooses between **Gemini** (for simple geometry) and **SAM3** (for organic shapes) based on part complexity.
- **Sequential Multi-Persona Workflow**:
    - **Director**: Analyzes structure and assigns strategies.
    - **Workers**: Extract geometry with self-reflection loops.
    - **Architect**: Builds the kinematic hierarchy and rig.
- **Occlusion-Aware Reconstruction**: Generates full textures for hidden areas using **Gemini 1.5 Pro** or **Fal.ai Flux**, enabling seamless rotation.
- **Smart Atlas Packing**: Optimized layouts (MaxRects, Grid) for efficient texture usage.
- **Web-Based Editor**: Complete interactive UI for visualizing every stage of the pipeline.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS.
- **Orchestration**: Custom Multi-Step Pipeline.
- **AI Services**:
  - **Reasoning**: `gemini-3-flash-preview` (Google)
  - **Segmentation**: `sam3` (Fal.ai)
  - **ImageGeneration**: `nanobanana 2 pro` or `flux-2` (Fal.ai)

## 📋 How It Works

1.  **Upload**: Provide a side-view or clear perspective image of a game object.
2.  **Director Step**: The AI analyzes the image, breaking it down into named parts and deciding *how* to extract them (Simple vs. Complex).
3.  **Worker Step**: Specialized modules extract precise geometries.
    - *Simple parts* use a Generate-Evaluate-Refine loop.
    - *Complex parts* use SAM3 for pixel-perfect masks.
4.  **Architect Step**: The system identifies parent-child relationships and pivot points.
5.  **Atlas & Gen**: Parts are packed into a sprite sheet, and textures are generated to fill the shapes.
6.  **Preview**: Instant kinematic validation using the generated rig.

## ⚙️ Usage

### Prerequisites
- Node.js & npm/yarn
- **Google GenAI API Key**
- **Fal.ai API Key**

### Setup
1. Clone the repo.
2. Rename `.env_example` to `.env` and fill in your API keys.

```bash
GEMINI_API_KEY=your_key_here
FAL_KEY=your_key_here
```

3. Run the development server:

```bash
npm install
npm run dev
```

## 📖 Documentation

See [WHITEPAPER.md](./WHITEPAPER.md) for a detailed technical overview of the "Sequential Multi-Persona" architecture and methodology.

## 📄 License

MIT. Use it to forge your next game masterpiece.
