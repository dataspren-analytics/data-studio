/**
 * Notebook Utilities
 *
 * Pure functions for notebook file operations (list, read, write).
 * These replace the old FileSyncer wrapper — no state, no events, no class.
 */

import type { NotebookDocument } from "./core/nbformat";
import { parseNotebook, serializeNotebook } from "./core/nbformat";
import type { IRuntimeFileSystem } from "./backends/execution/interface";
import type { FileInfo } from "./backends/execution/interface";

const MOUNT_PATH = "/mnt";

export interface NotebookInfo {
  name: string;
  path: string;
  updatedAt: number;
}

/**
 * Strip the /mnt prefix from a full path to get a relative path
 * suitable for IRuntimeFileSystem file methods.
 */
export function getRelativePath(fullPath: string): string {
  if (fullPath.startsWith(MOUNT_PATH + "/")) {
    return fullPath.slice(MOUNT_PATH.length + 1);
  }
  if (fullPath.startsWith(MOUNT_PATH)) {
    return fullPath.slice(MOUNT_PATH.length);
  }
  return fullPath.replace(/^\/+/, "");
}

/**
 * List all .ipynb notebooks from the execution backend.
 */
export async function listNotebooks(
  execution: IRuntimeFileSystem,
): Promise<NotebookInfo[]> {
  const files = await execution.listFiles();
  const notebooks: NotebookInfo[] = [];

  for (const file of files) {
    if (!file.isDirectory && file.path.endsWith(".ipynb")) {
      try {
        const relativePath = getRelativePath(file.path);
        const data = await execution.readFile(relativePath);
        const content = new TextDecoder().decode(data);
        const doc = parseNotebook(content);
        const name =
          doc.metadata.dataspren?.name ?? file.name.replace(".ipynb", "");
        const updatedAt = doc.metadata.dataspren?.updated_at ?? Date.now();
        notebooks.push({ name, path: file.path, updatedAt });
      } catch (e) {
        console.warn(
          `[notebook-utils] Failed to parse notebook: ${file.path}`,
          e,
        );
      }
    }
  }

  notebooks.sort((a, b) => b.updatedAt - a.updatedAt);
  return notebooks;
}

/**
 * Read and parse a notebook document.
 */
export async function readNotebook(
  execution: IRuntimeFileSystem,
  path: string,
): Promise<NotebookDocument> {
  const relativePath = getRelativePath(path);
  const data = await execution.readFile(relativePath);
  const content = new TextDecoder().decode(data);
  return parseNotebook(content);
}

/**
 * Serialize and write a notebook document.
 */
export async function writeNotebook(
  execution: IRuntimeFileSystem,
  path: string,
  document: NotebookDocument,
  options?: { silent?: boolean },
): Promise<void> {
  const content = serializeNotebook(document);
  const data = new TextEncoder().encode(content);
  const relativePath = getRelativePath(path);
  await execution.writeFile(relativePath, data, options);
}

// Re-export for convenience
export type { FileInfo };
