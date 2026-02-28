/**
 * Main-thread OPFS utilities for early file listing and reading.
 *
 * These functions access the Origin Private File System directly from
 * the main thread without going through the Pyodide web worker, enabling
 * the UI to show the file tree and notebooks before the runtime is ready.
 */

import type { FileInfo } from "./backends/execution/interface";

const MOUNT_PREFIX = "/mnt/local";

async function listFilesRecursive(
  dir: FileSystemDirectoryHandle,
  pathPrefix: string,
): Promise<FileInfo[]> {
  const files: FileInfo[] = [];

  for await (const [name, handle] of dir.entries()) {
    const relativePath = pathPrefix ? `${pathPrefix}/${name}` : name;
    const fullPath = `${MOUNT_PREFIX}/${relativePath}`;

    if (handle.kind === "file") {
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        files.push({ name, path: fullPath, size: file.size, isDirectory: false });
      } catch {
        // File may be locked by a sync handle in another context, skip it
      }
    } else if (handle.kind === "directory") {
      files.push({ name, path: fullPath, size: 0, isDirectory: true });
      const subFiles = await listFilesRecursive(
        handle as FileSystemDirectoryHandle,
        relativePath,
      );
      files.push(...subFiles);
    }
  }

  return files;
}

/**
 * List all files in OPFS directly from the main thread.
 * Returns files with full /mnt/local/... paths matching the runtime convention.
 */
export async function listOPFSFiles(): Promise<FileInfo[]> {
  try {
    const root = await navigator.storage.getDirectory();
    const localDir: FileInfo = {
      name: "local",
      path: "/mnt/local",
      size: 0,
      isDirectory: true,
    };
    const files = await listFilesRecursive(root, "");
    return [localDir, ...files];
  } catch {
    return [];
  }
}

/**
 * Read a file from OPFS directly from the main thread.
 * @param opfsPath - Path relative to OPFS root (e.g., "My_Notebook.ipynb" or "subdir/file.csv")
 */
export async function readOPFSFile(opfsPath: string): Promise<Uint8Array> {
  const parts = opfsPath.split("/").filter(Boolean);
  const root = await navigator.storage.getDirectory();

  let dir: FileSystemDirectoryHandle = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]);
  }

  const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
  const file = await fileHandle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}
