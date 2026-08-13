/** Prefix public asset paths with Vite `base` (needed for GitHub Pages subpath). */
export function assetUrl(path: string): string {
  const clean = path.replace(/^\//, "");
  return `${import.meta.env.BASE_URL}${clean}`;
}
