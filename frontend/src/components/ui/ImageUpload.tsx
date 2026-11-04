import { useRef, useState } from "react";
import { Button } from "./Button";

export type ImageUploadValue = {
  content_type: "image/jpeg" | "image/png" | "image/webp";
  data_base64: string;
};

export type ImageUploadProps = {
  label?: string;
  /** Existing image to show, typically an authenticated object URL. */
  previewUrl?: string | null;
  onSelect: (value: ImageUploadValue) => void;
  onRemove?: () => void;
  disabled?: boolean;
  busy?: boolean;
};

/** Must stay at or below the server's cap (FR-088). */
const MAX_BYTES = 2 * 1024 * 1024;
/** Longest edge after downscaling. Ample for a profile photograph. */
const MAX_EDGE = 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"] as const;

type Accepted = (typeof ACCEPTED)[number];

function isAccepted(type: string): type is Accepted {
  return (ACCEPTED as readonly string[]).includes(type);
}

/**
 * Downscales through a canvas and re-encodes, so a phone photo of several megabytes becomes
 * a few hundred kilobytes before it is sent.
 *
 * Without this, most real uploads would be refused: a modern phone camera produces 4-8 MB
 * files and the server caps at 2 MB. Rejecting those and asking the member to resize the
 * image themselves is not a realistic instruction.
 *
 * PNG is re-encoded as PNG to preserve any transparency; everything else becomes JPEG, which
 * is far smaller for photographs.
 */
async function downscale(file: File): Promise<ImageUploadValue> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = objectUrl;
    });

    const longestEdge = Math.max(image.width, image.height);
    const scale = longestEdge > MAX_EDGE ? MAX_EDGE / longestEdge : 1;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not process that image.");
    context.drawImage(image, 0, 0, width, height);

    const outputType: Accepted = file.type === "image/png" ? "image/png" : "image/jpeg";

    // Step the quality down until it fits, rather than failing at the first attempt.
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const dataUrl = canvas.toDataURL(outputType, quality);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      // 4 base64 characters carry 3 bytes.
      const approxBytes = Math.floor((base64.length * 3) / 4);
      if (approxBytes <= MAX_BYTES) {
        return { content_type: outputType, data_base64: base64 };
      }
      if (outputType === "image/png") break; // quality is ignored for PNG
    }

    throw new Error("That image is too large even after resizing. Please choose a smaller one.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ImageUpload({
  label,
  previewUrl,
  onSelect,
  onRemove,
  disabled,
  busy
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = event.target.files?.[0];
    // Clear immediately, so choosing the same file again still fires a change event.
    event.target.value = "";
    if (!file) return;

    // The `accept` attribute is a filter in the file dialog, not a guarantee, and the
    // server checks the actual bytes regardless (FR-089).
    if (!isAccepted(file.type)) {
      setError("Choose a JPEG, PNG or WebP image.");
      return;
    }

    setWorking(true);
    try {
      onSelect(await downscale(file));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not read that image.");
    } finally {
      setWorking(false);
    }
  }

  const isBusy = Boolean(busy) || working;

  return (
    <div className="block text-left">
      {label ? <div className="mb-1 text-sm font-semibold">{label}</div> : null}

      <div className="flex items-start gap-3">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-surface">
          {previewUrl ? (
            <img src={previewUrl} alt="Profile photograph" className="h-full w-full object-cover" />
          ) : (
            <span className="px-2 text-center text-xs text-textMuted">No photo</span>
          )}
        </div>

        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            onChange={onFileChange}
            disabled={disabled || isBusy}
            className="block w-full text-sm file:mr-2 file:rounded-button file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
          />

          <div className="text-xs text-textMuted">
            JPEG, PNG or WebP. Large photos are resized automatically.
          </div>

          {previewUrl && onRemove ? (
            <Button type="button" variant="ghost" disabled={disabled || isBusy} onClick={onRemove}>
              Remove photo
            </Button>
          ) : null}

          {isBusy ? <div className="text-xs text-textMuted">Processing...</div> : null}
          {error ? (
            <div role="alert" className="text-xs text-danger">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
