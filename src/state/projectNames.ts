/** The last component of a canonical project path, on any supported platform. */
export function projectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
