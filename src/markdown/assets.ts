export const localAssetPattern = /!\[([^\]]*)\]\(asset:\/\/([A-Za-z0-9-]+)\)/g;

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function prepareAssetMarkdown(markdown: string) {
  return markdown.replace(
    localAssetPattern,
    (_match, alt: string, id: string) => `<img data-asset-id="${escapeHtml(id)}" alt="${escapeHtml(alt)}">`,
  );
}

export function getLocalAssetReferences(markdown: string) {
  const references: Array<{ id: string; alt: string }> = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(localAssetPattern)) {
    const id = match[2];
    if (seen.has(id)) continue;
    seen.add(id);
    references.push({ id, alt: match[1] });
  }
  return references;
}

const markdownImagePattern = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\s*\)/g;

// Anything that is not a reachable URL (relative paths, file://, VS Code webview resources) can't be shown or copied.
export function isLocalImagePath(url: string) {
  const value = url.trim();
  if (!value || /^(?:asset|data|blob):/i.test(value)) return false;
  if (/^https?:\/\//i.test(value)) return /vscode-resource|vscode-cdn\.net/i.test(value);
  return true;
}

export function getImageFileName(url: string) {
  const path = url.trim().replace(/^<|>$/g, "").split(/[?#]/)[0];
  const name = path.split(/[\\/]/).pop() ?? "";
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export type MissingLocalImage = { url: string; fileName: string; alt: string };

export function getMissingLocalImages(markdown: string) {
  const images: MissingLocalImage[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(markdownImagePattern)) {
    const url = match[2].replace(/^<|>$/g, "");
    if (!isLocalImagePath(url) || seen.has(url)) continue;
    const fileName = getImageFileName(url);
    if (!fileName) continue;
    seen.add(url);
    images.push({ url, fileName, alt: match[1] });
  }
  return images;
}

export function replaceImageUrl(markdown: string, url: string, replacement: string) {
  return markdown.replace(markdownImagePattern, (match, alt: string, rawUrl: string) =>
    rawUrl.replace(/^<|>$/g, "") === url ? `![${alt}](${replacement})` : match,
  );
}

export function getReferencedAssetIds(markdowns: string[]) {
  return new Set(markdowns.flatMap((markdown) => getLocalAssetReferences(markdown).map((item) => item.id)));
}
