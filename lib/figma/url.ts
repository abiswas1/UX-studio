/** Extract the file key from a Figma URL (design, branch or board). Returns "" if none. */
export function figmaFileKey(url: string): string {
  const m = url.match(/figma\.com\/(?:design|file|board)\/([0-9a-zA-Z]{22,128})(?:\/branch\/([0-9a-zA-Z]{22,128}))?/);
  if (!m) return "";
  return m[2] ?? m[1];
}

export function figmaNodeUrl(fileKey: string, nodeId: string): string {
  return `https://www.figma.com/design/${fileKey}/?node-id=${nodeId.replace(":", "-")}`;
}
