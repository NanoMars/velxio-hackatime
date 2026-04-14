import { create } from 'zustand';
import {
  DEFAULT_BOARD_KIND,
  DEFAULT_INO_CONTENT,
  DEFAULT_HTML_H_CONTENT,
  DEFAULT_PY_CONTENT,
} from './defaultProject';

export interface WorkspaceFile {
  id: string;
  name: string;
  content: string;
  modified: boolean;
}

const MAIN_ID = 'main-sketch';
const HTML_ID = 'html-header';

/** Default file group id is derived from the default board kind. */
const DEFAULT_GROUP_ID = `group-${DEFAULT_BOARD_KIND}`;

const DEFAULT_SKETCH_FILE: WorkspaceFile = {
  id: MAIN_ID,
  name: 'sketch.ino',
  content: DEFAULT_INO_CONTENT,
  modified: false,
};

const DEFAULT_HTML_FILE: WorkspaceFile = {
  id: HTML_ID,
  name: 'html.h',
  content: DEFAULT_HTML_H_CONTENT,
  modified: false,
};

/** Files shown in the editor on first load (no saved project). */
const DEFAULT_FILES: WorkspaceFile[] = [DEFAULT_SKETCH_FILE, DEFAULT_HTML_FILE];

interface EditorState {
  files: WorkspaceFile[];
  activeFileId: string;
  openFileIds: string[];
  theme: 'vs-dark' | 'light';
  fontSize: number;

  // ── File groups (one per board) ──────────────────────────────────────────
  /** Map of groupId → WorkspaceFile[]. Stored as plain object for Zustand. */
  fileGroups: Record<string, WorkspaceFile[]>;
  /** Active group (determines which board's files are shown in the editor). */
  activeGroupId: string;
  /** Active file within the active group */
  activeGroupFileId: Record<string, string>;
  /** Open file IDs within each group */
  openGroupFileIds: Record<string, string[]>;

  // File operations (operate on active group)
  createFile: (name: string) => string;
  deleteFile: (id: string) => void;
  renameFile: (id: string, newName: string) => void;
  setFileContent: (id: string, content: string) => void;
  markFileSaved: (id: string) => void;
  openFile: (id: string) => void;
  closeFile: (id: string) => void;
  setActiveFile: (id: string) => void;
  /** Load a full set of files (e.g. when loading a saved project) */
  loadFiles: (files: { name: string; content: string }[]) => void;

  // File group management
  createFileGroup: (groupId: string, initialFiles?: { name: string; content: string }[]) => void;
  deleteFileGroup: (groupId: string) => void;
  setActiveGroup: (groupId: string) => void;
  getGroupFiles: (groupId: string) => WorkspaceFile[];
  updateGroupFile: (groupId: string, fileId: string, content: string) => void;

  // Settings
  setTheme: (theme: 'vs-dark' | 'light') => void;
  setFontSize: (size: number) => void;

  // Dirty flag — tracks whether code changed since last compilation
  codeChangedSinceLastCompile: boolean;
  markCompiled: () => void;

  // Legacy compat — sets content of the active file
  setCode: (code: string) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  files: DEFAULT_FILES,
  activeFileId: MAIN_ID,
  openFileIds: [MAIN_ID],
  theme: 'vs-dark',
  fontSize: 14,

  // File groups — initial state has one group for the default ESP32 board,
  // pre-populated with the captive-portal template's sketch.ino + html.h.
  fileGroups: {
    [DEFAULT_GROUP_ID]: DEFAULT_FILES,
  },
  activeGroupId: DEFAULT_GROUP_ID,
  activeGroupFileId: { [DEFAULT_GROUP_ID]: MAIN_ID },
  openGroupFileIds: { [DEFAULT_GROUP_ID]: [MAIN_ID] },

  codeChangedSinceLastCompile: true,
  markCompiled: () => set({ codeChangedSinceLastCompile: false }),

  // ── File operations (legacy API — operate on active group) ──────────────

  createFile: (name: string) => {
    const id = crypto.randomUUID();
    const newFile: WorkspaceFile = { id, name, content: '', modified: false };
    set((s) => {
      const groupId = s.activeGroupId;
      const groupFiles = [...(s.fileGroups[groupId] ?? []), newFile];
      return {
        // Legacy flat list (mirrors active group)
        files: [...s.files, newFile],
        openFileIds: [...s.openFileIds, id],
        activeFileId: id,
        // Group-aware state
        fileGroups: { ...s.fileGroups, [groupId]: groupFiles },
        openGroupFileIds: { ...s.openGroupFileIds, [groupId]: [...(s.openGroupFileIds[groupId] ?? []), id] },
        activeGroupFileId: { ...s.activeGroupFileId, [groupId]: id },
      };
    });
    return id;
  },

  deleteFile: (id: string) => {
    set((s) => {
      const groupId = s.activeGroupId;
      const files = s.files.filter((f) => f.id !== id);
      const openFileIds = s.openFileIds.filter((fid) => fid !== id);
      let activeFileId = s.activeFileId;
      if (activeFileId === id) {
        const idx = s.openFileIds.indexOf(id);
        activeFileId =
          openFileIds[idx] ??
          openFileIds[idx - 1] ??
          openFileIds[0] ??
          files[0]?.id ??
          '';
      }
      const groupFiles = (s.fileGroups[groupId] ?? []).filter((f) => f.id !== id);
      const groupOpenIds = (s.openGroupFileIds[groupId] ?? []).filter((fid) => fid !== id);
      return {
        files,
        openFileIds,
        activeFileId,
        fileGroups: { ...s.fileGroups, [groupId]: groupFiles },
        openGroupFileIds: { ...s.openGroupFileIds, [groupId]: groupOpenIds },
        activeGroupFileId: { ...s.activeGroupFileId, [groupId]: activeFileId },
      };
    });
  },

  renameFile: (id: string, newName: string) => {
    set((s) => {
      const groupId = s.activeGroupId;
      const mapper = (f: WorkspaceFile) =>
        f.id === id ? { ...f, name: newName, modified: true } : f;
      return {
        files: s.files.map(mapper),
        fileGroups: { ...s.fileGroups, [groupId]: (s.fileGroups[groupId] ?? []).map(mapper) },
      };
    });
  },

  setFileContent: (id: string, content: string) => {
    set((s) => {
      const groupId = s.activeGroupId;
      const mapper = (f: WorkspaceFile) =>
        f.id === id ? { ...f, content, modified: true } : f;
      return {
        files: s.files.map(mapper),
        fileGroups: { ...s.fileGroups, [groupId]: (s.fileGroups[groupId] ?? []).map(mapper) },
        codeChangedSinceLastCompile: true,
      };
    });
  },

  markFileSaved: (id: string) => {
    set((s) => {
      const groupId = s.activeGroupId;
      const mapper = (f: WorkspaceFile) =>
        f.id === id ? { ...f, modified: false } : f;
      return {
        files: s.files.map(mapper),
        fileGroups: { ...s.fileGroups, [groupId]: (s.fileGroups[groupId] ?? []).map(mapper) },
      };
    });
  },

  openFile: (id: string) => {
    set((s) => {
      const groupId = s.activeGroupId;
      const groupOpenIds = s.openGroupFileIds[groupId] ?? [];
      return {
        openFileIds: s.openFileIds.includes(id) ? s.openFileIds : [...s.openFileIds, id],
        activeFileId: id,
        openGroupFileIds: {
          ...s.openGroupFileIds,
          [groupId]: groupOpenIds.includes(id) ? groupOpenIds : [...groupOpenIds, id],
        },
        activeGroupFileId: { ...s.activeGroupFileId, [groupId]: id },
      };
    });
  },

  closeFile: (id: string) => {
    set((s) => {
      const groupId = s.activeGroupId;
      const openFileIds = s.openFileIds.filter((fid) => fid !== id);
      let activeFileId = s.activeFileId;
      if (activeFileId === id) {
        const idx = s.openFileIds.indexOf(id);
        activeFileId =
          openFileIds[idx] ?? openFileIds[idx - 1] ?? openFileIds[0] ?? '';
      }
      const groupOpenIds = (s.openGroupFileIds[groupId] ?? []).filter((fid) => fid !== id);
      return {
        openFileIds,
        activeFileId,
        openGroupFileIds: { ...s.openGroupFileIds, [groupId]: groupOpenIds },
        activeGroupFileId: { ...s.activeGroupFileId, [groupId]: activeFileId },
      };
    });
  },

  setActiveFile: (id: string) => {
    set((s) => {
      const groupId = s.activeGroupId;
      return {
        activeFileId: id,
        activeGroupFileId: { ...s.activeGroupFileId, [groupId]: id },
      };
    });
  },

  loadFiles: (incoming: { name: string; content: string }[]) => {
    const files: WorkspaceFile[] = incoming.map((f, i) => ({
      id: i === 0 ? MAIN_ID : crypto.randomUUID(),
      name: f.name,
      content: f.content,
      modified: false,
    }));
    const firstId = files[0]?.id ?? MAIN_ID;
    set((s) => {
      const groupId = s.activeGroupId;
      return {
        files,
        activeFileId: firstId,
        openFileIds: [firstId],
        fileGroups: { ...s.fileGroups, [groupId]: files },
        activeGroupFileId: { ...s.activeGroupFileId, [groupId]: firstId },
        openGroupFileIds: { ...s.openGroupFileIds, [groupId]: [firstId] },
      };
    });
  },

  // ── File group management ─────────────────────────────────────────────────

  createFileGroup: (groupId: string, initialFiles?: { name: string; content: string }[]) => {
    set((s) => {
      if (s.fileGroups[groupId]) return s; // already exists

      let files: WorkspaceFile[];
      if (initialFiles && initialFiles.length > 0) {
        files = initialFiles.map((f, i) => ({
          id: i === 0 ? `${groupId}-main` : crypto.randomUUID(),
          name: f.name,
          content: f.content,
          modified: false,
        }));
      } else {
        // Determine default file by group name convention
        const isPi = groupId.includes('raspberry-pi-3');
        const mainId = `${groupId}-main`;
        files = [{
          id: mainId,
          name: isPi ? 'script.py' : 'sketch.ino',
          content: isPi ? DEFAULT_PY_CONTENT : DEFAULT_INO_CONTENT,
          modified: false,
        }];
      }

      const firstId = files[0]?.id ?? `${groupId}-main`;
      return {
        fileGroups: { ...s.fileGroups, [groupId]: files },
        activeGroupFileId: { ...s.activeGroupFileId, [groupId]: firstId },
        openGroupFileIds: { ...s.openGroupFileIds, [groupId]: [firstId] },
      };
    });
  },

  deleteFileGroup: (groupId: string) => {
    set((s) => {
      const { [groupId]: _removed, ...rest } = s.fileGroups;
      const { [groupId]: _a, ...restActive } = s.activeGroupFileId;
      const { [groupId]: _o, ...restOpen } = s.openGroupFileIds;
      return {
        fileGroups: rest,
        activeGroupFileId: restActive,
        openGroupFileIds: restOpen,
      };
    });
  },

  setActiveGroup: (groupId: string) => {
    set((s) => {
      const groupFiles = s.fileGroups[groupId] ?? [];
      const activeFileId = s.activeGroupFileId[groupId] ?? groupFiles[0]?.id ?? '';
      const openFileIds = s.openGroupFileIds[groupId] ?? (groupFiles[0] ? [groupFiles[0].id] : []);
      return {
        activeGroupId: groupId,
        files: groupFiles,
        activeFileId,
        openFileIds,
      };
    });
  },

  getGroupFiles: (groupId: string) => {
    return get().fileGroups[groupId] ?? [];
  },

  updateGroupFile: (groupId: string, fileId: string, content: string) => {
    set((s) => {
      const groupFiles = (s.fileGroups[groupId] ?? []).map((f) =>
        f.id === fileId ? { ...f, content, modified: true } : f
      );
      return { fileGroups: { ...s.fileGroups, [groupId]: groupFiles } };
    });
  },

  // ── Settings ──────────────────────────────────────────────────────────────

  setTheme: (theme) => set({ theme }),
  setFontSize: (fontSize) => set({ fontSize }),

  // Legacy: sets content of active file
  setCode: (code: string) => {
    const { activeFileId, setFileContent } = get();
    if (activeFileId) setFileContent(activeFileId, code);
  },
}));
