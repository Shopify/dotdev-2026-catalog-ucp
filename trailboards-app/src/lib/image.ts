// Image element prep — reads a picked File into the base64 payload the connector sends as
// `like:[{ image }]` for visual catalog search (§5/§7). Keyless; runs entirely in the browser.
const MAX_BYTES = 8 * 1024 * 1024; // 8MB — server caps request bodies at 12MB (§10).

export interface ImagePayload {
  contentType: string;
  data: string; // base64, no data-URL prefix
}

export async function fileToImagePayload(file: File): Promise<ImagePayload> {
  if (file.size > MAX_BYTES) throw new Error('Image too large (max 8MB)');
  const dataUrl = await readAsDataUrl(file);
  const comma = dataUrl.indexOf(',');
  return {
    contentType: file.type || 'image/jpeg',
    data: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}
