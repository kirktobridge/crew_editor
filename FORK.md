# Fork notes (kirktobridge/crew_editor)

Personal fork of [glenwrhodes/crew_editor](https://github.com/glenwrhodes/crew_editor),
a visual node-based editor for CrewAI crews. Used to author crews for the
[`istari`](../istari) repo. This file documents our additions and how to make
more changes — it's intentionally separate from the upstream `README.md` so
pulling upstream never conflicts here.

## Remotes

| Remote | Points at | Purpose |
|--------|-----------|---------|
| `origin` | `kirktobridge/crew_editor` | our fork — push here |
| `upstream` | `glenwrhodes/crew_editor` | original — pull updates from here, never push |

We fork for our own use. We do **not** open PRs/issues against upstream.

Pull upstream changes when wanted:
```bash
git fetch upstream
git merge upstream/main        # or: git rebase upstream/main
```

## Dev workflow

```bash
npm install        # first time only
npm run dev        # dev server → http://localhost:5173/crew_editor/
npm run build      # tsc -b + vite build (type-checks AND bundles — run before committing)
npm run lint       # eslint
npm run preview    # serve the production build locally
```

Notes:
- **Base path is `/crew_editor/`** (`vite.config.ts`) for GitHub Pages, so the
  dev URL includes it — `localhost:5173` redirects to `localhost:5173/crew_editor/`.
- `npm run build` runs `tsc -b`, which is the real type gate — treat a green
  build as the bar before committing. `npm run lint` currently reports 2
  pre-existing errors in upstream files (`BeginNode.tsx`, `utils/export.ts`);
  our files are clean.
- The app is 100% client-side — no backend. All persistence is either browser
  `localStorage` or the file round-trip below.

## What this fork adds

### File-backed graph round-trip (`.crew.json`)
Branch `feat/graph-file-io` / commit `76f9ac1`.

Upstream only persists graphs to browser `localStorage`, so a crew's canvas
can't be version-controlled, shared, or reopened elsewhere; the YAML/Python
exports are one-way and drop layout + wiring. We added a full-fidelity save/open:

- **`src/utils/graphFile.ts`** — `saveGraphToFile` / `openGraphFromFile`.
  Serializes the whole canvas (`nodes`, `edges`, `crewSettings`, `graphName`) to
  a versioned `.crew.json` (`_format` + `version` markers, validated on load).
  Uses the File System Access API when available (Chromium) so files write into
  a repo folder and overwrite in place; falls back to Blob download / file input.
- **`src/components/Toolbar.tsx`** — *Save graph to file* / *Open graph from file*
  buttons (far right, after the localStorage Save/Open).
- **`src/App.tsx`** — `handleSaveGraphFile` / `handleOpenGraphFile`, reusing
  `migrateNodeData` on load and confirming before replacing a non-empty canvas.

The `.crew.json` is the source of truth for a crew's diagram. See
[`istari/crews/README.md`](../istari/crews/README.md) for the authoring loop.

## Architecture map (for future changes)

Single-page React + TypeScript + Vite app; canvas is [React Flow](https://reactflow.dev),
UI is Material-UI. Almost all state lives in the `Flow()` component in `App.tsx`.

| File | Responsibility |
|------|----------------|
| `src/App.tsx` | `Flow()` holds all canvas state (`nodes`, `edges`, `crewSettings`, saved graphs/agents/tasks), all handlers, and wires every child. The `nodeTypes` map registers node components. Start here for almost anything. |
| `src/types.ts` | `AgentData`, `TaskData`, `CrewSettings`, `SavedGraph`, etc. Also `DEFAULT_*_DATA` defaults, `AVAILABLE_TOOLS`/`LLMInfo` catalogs, and `migrateNodeData()` (upgrades old saved nodes to new fields). |
| `src/components/Toolbar.tsx` | Top bar. Actions are plain props passed down from `App.tsx`. |
| `src/components/Sidebar.tsx` | Draggable node palette + saved agent/task templates. |
| `src/components/PropertiesPanel.tsx` | Right-hand editor for the selected node's fields. |
| `src/components/nodes/*` | The canvas node renderers: `AgentNode`, `TaskNode`, `BeginNode`, `RerouteNode`. |
| `src/components/modals/*` | Save/Load/Export/CrewSettings/Confirm dialogs. |
| `src/utils/export.ts` | Generates `agents.yaml`, `tasks.yaml`, and `crew.py` from the graph. All CrewAI-output logic lives here. |
| `src/utils/graphFile.ts` | Our `.crew.json` save/open (above). |
| `src/utils/templates.ts` | Built-in starter crews (the welcome/template gallery). |
| `src/hooks/useUndoRedo.ts` | Snapshot-based undo/redo. |
| `src/theme.ts` | MUI theme + the `COLORS` palette used everywhere. |

### Common extension recipes

- **Add a toolbar action:** add a handler in `App.tsx` `Flow()`, add a prop to
  `ToolbarProps` in `Toolbar.tsx`, render a button, and pass the handler in the
  `<Toolbar .../>` JSX in `App.tsx`.
- **Add/extend a node field:** add it to the relevant interface + `DEFAULT_*_DATA`
  in `types.ts`, bump `migrateNodeData()` so old graphs get the default, edit the
  node renderer in `nodes/`, add an input in `PropertiesPanel.tsx`, and emit it in
  `utils/export.ts` (YAML + Python) if it should reach CrewAI.
- **Add a new node type:** create `nodes/XNode.tsx`, register it in the
  `nodeTypes` map in `App.tsx`, add it to the `Sidebar` palette, and handle its
  connection rules in `onConnect` in `App.tsx`.
- **Change generated CrewAI output:** it's all in `utils/export.ts`
  (`generateAgentsYaml`, `generateTasksYaml`, `generatePythonCode`).

### Sanity check before committing
```bash
npm run build && npm run lint
```
Green build = types + bundle OK. Lint should show only the 2 known upstream errors.
