# Neural Sprite Pipeline 🛠️✨

**Neural Sprite Pipeline** is an experimental research tool designed for game developers and artists to transform static concept art into production-ready, modular game assets.

Using the power of modern Multimodal AI, it decomposes objects into logical moving parts using polygon masks, generates high-fidelity textures for those parts (including occluded areas), and provides an instant rig preview.

## 🎬 Demo Videos

### Robot Arm
div align="center">
  <video src="[https://github.com/user-attachments/assets/4414adc0-086c-43de-b367-9362eeb20228" width="70%" poster=""> </video>
</div>

### Toy Character
[https://github.com/lucaspedrajas/N-Sprite/blob/main/demo-videos/excavator_toy.mp4]



## 🚀 Features

- **Image Normalization**: Input images are automatically fitted to a 1024×1024 white canvas for consistent coordinate space.
- **Polygon Mask Decomposition**: Uses Vision-Language Models to identify logical sub-components with tight-fitting polygon masks (4-6 vertices) instead of bounding boxes.
- **World-Space Pivots**: Pivot points are specified in absolute pixel coordinates for precise rotation/transform centers.
- **Occlusion-Aware Reconstruction**: Powered by Generative Image Models, the tool generates individual sprite art for each part, "hallucinating" areas that were hidden in the original image.
- **Smart Atlas Packing**: Multiple algorithms (row, grid, maxrects) arrange parts into a square sprite sheet at 1K or 2K resolution, displaying scaled polygon outlines.
- **Real-time Rig Preview**: Instant animation testing using Canvas-based matrix transformations.
- **Configurable Animations**: Supports Rotation, Horizontal/Vertical Translation, and Pulse Scaling based on AI analysis.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS.
- **Build Tool**: Vite.
- **AI Models**: Currently implemented using Google Gemini, but architected to be model-agnostic.
  - Structural Inference: `gemini-3-flash-preview`
  - Image Synthesis: `gemini-3-pro-image-preview` or Fal.ai Flux
- **Icons**: Lucide React.

## 📋 How It Works

1.  **Upload**: Provide a side-view or clear perspective image of a game object (e.g., a car, robot, or character).
2.  **Normalize**: The image is automatically fitted to a 1024×1024 white canvas, preserving aspect ratio.
3.  **Analyze**: The AI identifies individual parts with polygon masks and determines pivot points and movement types.
4.  **Layout**: The system creates an Atlas Layout with scaled polygon outlines marking where each part will be drawn.
5.  **Reconstruct**: The AI takes the original image and the polygon-based layout template to generate a clean, modular sprite sheet.
6.  **Preview**: The app rigs the generated sprites and displays an interactive animation to verify the asset's "feel."

## ⚙️ Development

This project uses the `@google/genai` SDK for the reference implementation. Ensure your environment has a valid `API_KEY` configured.


## IMPORTANT: rename .env_example file to just .env and fill in the api key values to use the app

then run:

### Commands
```bash
npm install
npm run dev
```

## 📖 Documentation

See [WHITEPAPER.md](./WHITEPAPER.md) for a detailed technical overview of the architecture and methodology.

## 📄 License

MIT. Use it to forge your next game masterpiece.
