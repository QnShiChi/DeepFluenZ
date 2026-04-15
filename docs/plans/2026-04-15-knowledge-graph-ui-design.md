# Knowledge Graph Frontend UI Design

## Overview
Implement the visual representation of the Knowledge Graph logic on the Desktop frontend. The focus is a "Spacial Interactive Graph" using a Split-Pane layout that makes full use of wide desktop screens while preserving usability.

## Layout & Architecture

1. **Split-Pane Workspace Layout:**
   - **Left Pane (40% width):** The Knowledge Graph canvas rendered using `@xyflow/react`. It allows panning and zooming. The graph is directed vertically (top-to-bottom) or horizontally (left-to-right).
   - **Right Pane (60% width):** The standard "Action Area" where the student engages with the AI Chat or takes Exams.
   
2. **Graph Visuals (Nodes & Edges):**
   - **Main Quests:** Large central nodes with clear iconography.
   - **Side Quests:** Nodes that spawn off the main path, connected via dashed or colored danger lines to indicate remedial paths.
   - Nodes will have states: Locked (grayed out), Active/In_progress (pulsing/glowing effect), and Mastered (green checkmark).

3. **Responsive Degradation:**
   - On screens `< 1024px`, the left pane automatically collapses into an off-canvas drawer or a floating "Map" button so as not to cramp the layout, allowing the action area to utilize 100% of the screen width.

## Tech Stack
- React/Next.js
- Tailwind CSS
- `@xyflow/react` for the graph rendering framework
