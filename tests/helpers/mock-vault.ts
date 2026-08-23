// tests/helpers/mock-vault.ts
// Reusable mock factory for tests that need an Obsidian-like App without running real Obsidian.
// NoteWriter, BaseFile, and NoteOrchestrator tests import makeMockVaultApp() and assert against
// the recorded calls.
import { vi } from 'vitest';

export interface MockVaultFile {
  path: string;
  name: string;
  extension: string;
  parent: { path: string } | null;
}

export interface MockVaultState {
  files: Map<string, MockVaultFile>;
  contents: Map<string, string>;
  frontmatter: Map<string, Record<string, unknown>>;
}

export function makeMockVaultApp(initialFiles: Record<string, string> = {}) {
  const state: MockVaultState = {
    files: new Map(),
    contents: new Map(),
    frontmatter: new Map(),
  };
  for (const [path, body] of Object.entries(initialFiles)) {
    const name = path.split('/').pop() ?? path;
    const extension = name.split('.').pop() ?? '';
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    state.files.set(path, {
      path, name, extension,
      parent: parentPath ? { path: parentPath } : null,
    });
    state.contents.set(path, body);
  }

  const getAbstractFileByPath = vi.fn((p: string) => state.files.get(p) ?? null);
  // Paths created via createFolder — vault.getFiles() must exclude them
  // (Obsidian's getFiles returns markdown-able FILES only).
  const folderPaths = new Set<string>();
  const getFiles = vi.fn(() =>
    [...state.files.values()].filter((f) => !folderPaths.has(f.path)),
  );
  const create = vi.fn(async (p: string, data: string) => {
    if (state.files.has(p)) throw new Error(`Vault.create: ${p} already exists`);
    const name = p.split('/').pop() ?? p;
    const extension = name.split('.').pop() ?? '';
    const parentPath = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    const file: MockVaultFile = { path: p, name, extension, parent: parentPath ? { path: parentPath } : null };
    state.files.set(p, file);
    state.contents.set(p, data);
    return file;
  });
  const createFolder = vi.fn(async (p: string) => {
    if (state.files.has(p)) return state.files.get(p)!;
    const name = p.split('/').pop() ?? p;
    const parentPath = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    const folder: MockVaultFile = { path: p, name, extension: '', parent: parentPath ? { path: parentPath } : null };
    state.files.set(p, folder);
    folderPaths.add(p);
    return folder;
  });
  const process = vi.fn(async (file: MockVaultFile, fn: (current: string) => string) => {
    const current = state.contents.get(file.path) ?? '';
    const next = fn(current);
    state.contents.set(file.path, next);
    return next;
  });
  const read = vi.fn(async (file: MockVaultFile) => state.contents.get(file.path) ?? '');
  const cachedRead = vi.fn(async (file: MockVaultFile) => state.contents.get(file.path) ?? '');

  const processFrontMatter = vi.fn(
    async (file: MockVaultFile, fn: (fm: Record<string, unknown>) => void) => {
      const existing = state.frontmatter.get(file.path) ?? {};
      // Mutate a COPY so the callback can reason about its own object while we snapshot.
      const mutable = { ...existing };
      fn(mutable);
      state.frontmatter.set(file.path, mutable);
    },
  );

  const openLinkText = vi.fn(async (_linktext: string, _source: string, _newLeaf?: boolean) => {
    /* no-op; tests assert on call args */
  });
  const getActiveViewOfType = vi.fn(() => null);
  // Quick-260605-wux — `revealNoteFile` falls through to `getLeaf('tab').openFile`
  // when `getActiveViewOfType(MarkdownView)` returns null (the default here).
  // Provide a default spy so tests that don't care about pane targeting don't
  // crash on the new branch. Tests that DO care can replace this with their
  // own `(m.app.workspace as Record<string, unknown>).getLeaf = vi.fn(...)`.
  const openFile = vi.fn(async (_file: MockVaultFile) => undefined);
  const getLeaf = vi.fn(() => ({ openFile }));

  // Phase 5.3 Plan 06 — minimal metadataCache.getFileCache that returns the
  // current frontmatter snapshot from state.frontmatter. Mirrors the read
  // shape used in src/main.ts switchFenceLanguage Step C
  // (`app.metadataCache.getFileCache(file)?.frontmatter`). Tests can seed via
  // `seedFrontmatter()` and observe writes via processFrontMatter.
  const getFileCache = vi.fn((file: MockVaultFile | { path?: string } | null | undefined) => {
    if (!file) return null;
    const path = (file as { path?: string }).path;
    if (!path) return null;
    const fm = state.frontmatter.get(path);
    return fm ? { frontmatter: { ...fm } } : null;
  });

  return {
    app: {
      vault: {
        getAbstractFileByPath,
        getFiles,
        create,
        createFolder,
        process,
        read,
        cachedRead,
      },
      fileManager: {
        processFrontMatter,
      },
      metadataCache: {
        getFileCache,
      },
      workspace: {
        openLinkText,
        getActiveViewOfType,
        getLeaf,
      },
    },
    state,
    // Convenience: expose spies at the top level for assertion ergonomics.
    spies: {
      getAbstractFileByPath, getFiles, create, createFolder, process, read, cachedRead,
      processFrontMatter, openLinkText, getActiveViewOfType, getFileCache,
      getLeaf, openFile,
    },
    /** Pre-populate frontmatter for a file (e.g., in regeneration tests). */
    seedFrontmatter(path: string, fm: Record<string, unknown>): void {
      state.frontmatter.set(path, { ...fm });
    },
    /** Read current frontmatter for assertions. */
    getFrontmatter(path: string): Record<string, unknown> | undefined {
      return state.frontmatter.get(path);
    },
    /** Read current body for assertions. */
    getContent(path: string): string | undefined {
      return state.contents.get(path);
    },
  };
}

export type MockVaultApp = ReturnType<typeof makeMockVaultApp>;
