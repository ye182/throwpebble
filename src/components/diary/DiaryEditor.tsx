import { useRef } from "react";
import type { VisibilityMode } from "../../lib/diaryApi";

export type { VisibilityMode };

const MAX_IMAGES = 3;
const MAX_IMAGE_EDGE = 960;

type Props = {
  body: string;
  onChange: (value: string) => void;
  images: string[];
  onImagesChange: (images: string[]) => void;
  onSave: () => void;
  saving: boolean;
  visibilityMode: VisibilityMode;
  onVisibilityModeChange: (mode: VisibilityMode) => void;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

/** Downscale large photos so localStorage / sync stays light. */
async function compressImageDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(
        1,
        MAX_IMAGE_EDGE / Math.max(img.width, img.height)
      );
      if (scale >= 0.99 && dataUrl.length < 400_000) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function DiaryEditor({
  body,
  onChange,
  images,
  onImagesChange,
  onSave,
  saving,
  visibilityMode,
  onVisibilityModeChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canSave = Boolean(body.trim() || images.length > 0);

  async function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return;
    const next = [...images];
    for (const file of Array.from(files).slice(0, room)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const raw = await readFileAsDataUrl(file);
        const compressed = await compressImageDataUrl(raw);
        if (compressed) next.push(compressed);
      } catch {
        /* skip broken file */
      }
    }
    onImagesChange(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeImage(index: number) {
    onImagesChange(images.filter((_, i) => i !== index));
  }

  return (
    <div className="diary-panel editor-panel">
      <div className="editor-paper">
        <textarea
          className="editor-textarea"
          value={body}
          onChange={(e) => onChange(e.target.value)}
          placeholder="把想说的写在这里…也可以只放一张图"
          maxLength={2000}
        />

        {images.length > 0 && (
          <ul className="editor-image-list" aria-label="已选图片">
            {images.map((src, i) => (
              <li key={`${i}-${src.slice(0, 24)}`} className="editor-image-item">
                <img src={src} alt="" className="editor-image-thumb" />
                <button
                  type="button"
                  className="editor-image-remove"
                  aria-label="移除图片"
                  onClick={() => removeImage(i)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="editor-actions">
          <div
            className="visibility-toggle"
            role="group"
            aria-label="日记可见模式"
          >
            <button
              type="button"
              className={
                visibilityMode === "private"
                  ? "visibility-btn is-active"
                  : "visibility-btn"
              }
              onClick={() => onVisibilityModeChange("private")}
              aria-pressed={visibilityMode === "private"}
            >
              私密
            </button>
            <button
              type="button"
              className={
                visibilityMode === "explore"
                  ? "visibility-btn is-active"
                  : "visibility-btn"
              }
              onClick={() => onVisibilityModeChange("explore")}
              aria-pressed={visibilityMode === "explore"}
            >
              探索
            </button>
          </div>
          <div className="editor-action-right">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="editor-file-input"
              aria-label="上传图片"
              onChange={(e) => void onPickFiles(e.target.files)}
            />
            <button
              type="button"
              className="editor-photo-btn"
              disabled={saving || images.length >= MAX_IMAGES}
              onClick={() => fileRef.current?.click()}
            >
              图片
            </button>
            <button
              type="button"
              className="btn-save"
              onClick={onSave}
              disabled={saving || !canSave}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
