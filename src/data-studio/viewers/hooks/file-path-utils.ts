/** Extract filename from a path, with fallback */
export function getFileName(filePath: string, fallback = "file"): string {
  return filePath.split("/").pop() || fallback;
}

/** Extract parent directory from a path */
export function getParentDir(filePath: string): string | undefined {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : undefined;
}
