AI-Driven Kinematic Decomposition ArchitectureA "Map-Reduce" Approach to Game Asset Rigging1. Executive SummaryThis document outlines a multi-agent architectural pattern designed to overcome the cognitive and spatial limitations of Multimodal LLMs (like Gemini 2.5 Flash) when processing high-resolution game assets.Instead of a single "monolithic" prompt attempting to solve segmentation, hierarchy, and occlusion simultaneously, this architecture utilizes a Waterfall-to-Parallel workflow. This divides the task into three specialized distinct stages: Discovery, Reconstruction, and Rigging.2. The Core Problem: Spatial HallucinationStandard Multimodal LLMs struggle with "dense pixel prediction." When asked to trace a complex polygon for a specific part in a cluttered image, models often:Drift: Lose track of coordinates due to token overload.Fail on Occlusion: Cannot complete shapes hidden behind other parts.Hallucinate Hierarchy: Confuse visual proximity with mechanical connection.3. The Solution: The "Assembly Line" ArchitectureThis architecture bifurcates the workload into logical steps, maximizing the model's "attention mechanism" for each specific task.High-Level Data Flow:[Input Image] → [Director] → [Manifest] → [Parallel Workers] → [Geometry Data] → [Rigging Architect] → [Final JSON]Stage 1: The Director (Discovery & Grounding)Role: The Project Manager.Goal: Identification and Coarse Localization. The Director does not draw shapes.Input: Original 1024x1024 Image.Prompt Strategy: * Identify all distinct mechanical/organic parts.Assign a unique id.Crucial: Provide a visual_pointer (a single {x,y} coordinate or rough bounding box) that falls strictly inside the object. This resolves ambiguity between identical parts (e.g., "Left Wheel" vs "Right Wheel").Output: Part_Manifest.jsonSample Director PromptAnalyze the image. List all rigid moving parts required for a cutout animation rig.
For each part, provide:
1. id: snake_case unique name.
2. visual_anchor: [x, y] - A single point ensuring I know WHICH part you mean.
3. type_hint: "WHEEL", "LIMB", "PISTON", "DECORATION".
Stage 2: The Parallel Workers (Geometry & Reconstruction)Role: The Parametric Drafters.Goal: Deep geometric reconstruction and occlusion solving.Concurrency: One API request per part (run in parallel).Input: Original Image + The specific visual_anchor from the Director.Method: Parametric Reconstruction.Instead of tracing pixels (which creates jagged lines), workers fit mathematical primitives (Circle, Rectangle, Capsule) to the visual data.Amodal Completion: Workers are explicitly instructed to "hallucinate" the hidden portions of the object based on the visible curvature/edges.Output: Geometry_Data_Part_X.jsonSample Worker Prompt (Template)Context: You are reconstructing the part named "{id}".
Focus your attention on the area around {visual_anchor}.

Task:
1. Ignore covering objects. Imagine the object is isolated.
2. Fit a Mathematical Primitive to this object.
   - If round, return { type: "CIRCLE", center: {x,y}, radius: r }
   - If boxy, return { type: "RECT", center: {x,y}, width: w, height: h, rotation: deg }
   - If limb-like, return { type: "CAPSULE", start: {x,y}, end: {x,y}, radius: r }
3. Return the exact Bounding Box of this reconstructed shape.
Stage 3: The Rigging Architect (Hierarchy & Physics)Role: The Lead Engineer.Goal: Logical Assembly.Input: The Geometry_Data from all Workers + Original Image.Logic: The Architect does not look for pixels; it looks for relationships.Hierarchy: Uses the Bounding Boxes from Stage 2. If a small "Hand" box is adjacent to a large "Forearm" box, the hierarchy is established.Pivot Points: It looks for "Visual Anchors" (bolts, screw heads, or geometric centers) within the overlapping regions of the now-defined parts.Kinematics: Assigns movement types based on the part name and shape (e.g., Pistons = Prismatic/Sliding).Sample Architect PromptYou are the Rigging Architect. 
Here is the list of defined parts with their exact shapes and bounds:
[Insert Worker JSONs here]

Task:
1. Build the Hierarchy Tree (parent_id).
   - Logic: Parts usually attach to larger overlapping bodies.
2. Define Pivot Points.
   - Example: The pivot for a wheel is its geometric center (provided by Worker).
   - Example: The pivot for a knee is the center of the overlap between thigh and shin.
3. Assign Movement Type: ROTATION, SLIDING, or FIXED.
4. Technical BenefitsFeatureBenefitAttention IsolationBy processing one part at a time, the model's full context window is dedicated to a single geometric problem, drastically reducing hallucinations.Occlusion HandlingWorkers are freed from the context of the whole image, allowing them to logically complete hidden shapes (e.g., "It's a wheel, therefore it must be round").Clean DataOutputting primitives (Circles/Rects) creates engine-ready colliders immediately, unlike jagged polygon arrays.ScalabilityThe architecture works for simple characters or complex mechs with 50+ parts simply by scaling the number of Worker requests.5. Implementation RoadmapGrid Overlay (Pre-process): Overlay a faint coordinate grid on the input image to assist the Director in generating accurate visual_anchors.Orchestrator Script: A Python/Node.js script to manage the flow:Call Director.Parse Manifest.Promise.all() to spawn Workers.Aggregate JSONs.Call Architect with aggregated data.Visualizer (Post-process): A simple canvas script to draw the resulting Primitives and Pivot points over the image for human verification.
### Summary of Changes made to your workflow:
1.  **Decomposed the Task:** Moved from one big prompt to three specialized roles.
2.  **Changed the Output:** Moved from "Polygon Arrays" (Hard) to "Parametric Primitives" (Robust).
3.  **Added Grounding:** Introduced the "Visual Pointer" concept to prevent parallel workers from confusing identical parts.
4.  **Dedicated Logic Step:** Moved hierarchy and pivoting to the end, so decisions are made based on *clean* geometry data rather than guesses.

This architecture turns a "creative writing" task into an "engineering pipeline," which is exactly how you get reliable technical results from LLMs.
