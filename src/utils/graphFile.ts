import { Node, Edge } from 'reactflow';
import { CrewSettings } from '../types';

// On-disk format for a crew graph. This is the full editable state of the
// canvas (positions, connections, per-node config and crew settings) so a
// crew can be reopened later with complete fidelity — unlike the YAML/Python
// exports, which are one-way and lose layout/wiring.
export interface CrewGraphFile {
  _format: 'crew_editor.graph';
  version: 1;
  graphName: string;
  crewSettings: CrewSettings;
  nodes: Node[];
  edges: Edge[];
  savedAt: string;
}

export function serializeGraph(
  graphName: string,
  crewSettings: CrewSettings,
  nodes: Node[],
  edges: Edge[],
): string {
  const payload: CrewGraphFile = {
    _format: 'crew_editor.graph',
    version: 1,
    graphName,
    crewSettings,
    nodes,
    edges,
    savedAt: new Date().toISOString(),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseGraphFile(text: string): CrewGraphFile {
  const data = JSON.parse(text);
  if (data?._format !== 'crew_editor.graph') {
    throw new Error('Not a crew_editor graph file (missing _format marker).');
  }
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Graph file is missing nodes/edges.');
  }
  return data as CrewGraphFile;
}

function slugify(name: string): string {
  return (name || 'crew').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'crew';
}

interface FileSystemAccessWindow extends Window {
  showSaveFilePicker?: (opts: unknown) => Promise<{
    createWritable: () => Promise<{
      write: (data: string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
  showOpenFilePicker?: (opts: unknown) => Promise<Array<{
    getFile: () => Promise<File>;
  }>>;
}

// Save the graph to disk. Uses the File System Access API when available
// (Chromium) so the user can drop the file straight into their repo and
// overwrite it in place on re-save; otherwise falls back to a plain download.
export async function saveGraphToFile(
  graphName: string,
  crewSettings: CrewSettings,
  nodes: Node[],
  edges: Edge[],
): Promise<void> {
  const content = serializeGraph(graphName, crewSettings, nodes, edges);
  const suggestedName = `${slugify(graphName)}.crew.json`;
  const w = window as FileSystemAccessWindow;

  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [{
          description: 'Crew graph',
          accept: { 'application/json': ['.crew.json', '.json'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    } catch (err) {
      // User cancelled the picker — treat as a no-op, don't fall through to a download.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      throw err;
    }
  }

  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

// Open a graph file from disk and return its parsed contents, or null if the
// user cancelled. Uses the File System Access API when available, else a
// hidden <input type=file>.
export async function openGraphFromFile(): Promise<CrewGraphFile | null> {
  const w = window as FileSystemAccessWindow;

  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [{
          description: 'Crew graph',
          accept: { 'application/json': ['.crew.json', '.json'] },
        }],
        multiple: false,
      });
      const file = await handle.getFile();
      return parseGraphFile(await file.text());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      throw err;
    }
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.crew.json,.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try {
        resolve(parseGraphFile(await file.text()));
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}
