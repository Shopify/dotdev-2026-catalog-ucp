// Inspiration card. The shopper browses for an image; it becomes the visual-search seed (buildContext
// sends payload.data as the catalog's like[].image) and, when a key is configured, the server captions
// it and fills the description — otherwise the field asks the shopper to describe it. Uploads are
// downscaled to ~1024px JPEG so the base64 stays small enough to persist (12mb body cap) and search fast.
import { useRef, useState } from 'react';
import { ContourBackground } from './ContourBackground';
import { describeImage } from '../services/describe';

interface Encoded {
  contentType: string;
  data: string; // raw base64, no data: prefix — matches the catalog like[] payload
}

function stripDataUrl(url: string, fallbackType: string): Encoded {
  const comma = url.indexOf(',');
  const header = url.slice(0, comma);
  const type = /data:([^;]+)/.exec(header)?.[1] ?? fallbackType;
  return { contentType: type, data: comma >= 0 ? url.slice(comma + 1) : url };
}

// Downscale + re-encode as JPEG via canvas; fall back to the raw file if the browser can't decode it.
async function encodeImage(file: File, max = 1024): Promise<Encoded> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return stripDataUrl(canvas.toDataURL('image/jpeg', 0.82), 'image/jpeg');
  } catch {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    return stripDataUrl(url, file.type || 'image/jpeg');
  }
}

function newAssetId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `img-${Date.now()}`;
}

export function ImageElement({
  payload,
  description,
  placeholder,
  onPatch,
}: {
  payload: Record<string, unknown>;
  description: string;
  placeholder: string;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const data = typeof payload.data === 'string' ? payload.data : '';
  const contentType = typeof payload.contentType === 'string' ? payload.contentType : 'image/jpeg';
  const preview = data ? `data:${contentType};base64,${data}` : '';

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked later
    if (!file) return;
    const img = await encodeImage(file);
    onPatch({ assetId: (typeof payload.assetId === 'string' && payload.assetId) || newAssetId(), ...img });

    // Auto-caption when the server has a key; otherwise leave the field for the shopper to fill.
    setBusy(true);
    try {
      const { available, description: desc } = await describeImage(img.contentType, img.data);
      if (available && desc) onPatch({ name: desc });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      <button
        type="button"
        className="imgcard"
        onClick={() => fileRef.current?.click()}
        title={preview ? 'Replace image' : 'Browse for an image'}
        aria-label={preview ? 'Replace inspiration image' : 'Browse for an inspiration image'}
      >
        {preview ? (
          <img className="img-preview" src={preview} alt="" />
        ) : (
          <>
            <ContourBackground />
            <span className="img-add">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 15l5-5 4 4 3-3 6 6" />
                <circle cx="8.5" cy="8.5" r="1.5" />
              </svg>
              Browse image
            </span>
          </>
        )}
      </button>
      <input
        className="el-sub el-input"
        value={description}
        placeholder={busy ? 'Describing…' : placeholder}
        onChange={(e) => onPatch({ name: e.target.value })}
        disabled={busy}
      />
    </>
  );
}
