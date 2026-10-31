import { Camera, Image as ImageIcon, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { isBlurry } from "../imaging/blur";
import type { PreparedPage } from "../imaging/render";
import { newId } from "../storage/id";
import { Notice } from "../ui/Notice";
import { primaryButton, secondaryButton } from "../ui/styles";
import { CropEditor } from "./CropEditor";
import type { PageDraft } from "./types";

interface Props {
  pages: PageDraft[];
  onChange: (pages: PageDraft[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export function PhotosStep({ pages, onChange, onBack, onNext }: Props) {
  const [editing, setEditing] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    try {
      setEditing(await createImageBitmap(file, { imageOrientation: "from-image" }));
    } catch {
      setError("This file could not be opened as an image. Try taking the photo again.");
    }
  }

  function addPage(page: PreparedPage) {
    editing?.close();
    setEditing(null);
    onChange([
      ...pages,
      { id: newId(), blob: page.blob, url: URL.createObjectURL(page.blob), width: page.width, height: page.height, blur: page.blur },
    ]);
  }

  function remove(id: string) {
    const page = pages.find((p) => p.id === id);
    if (page) URL.revokeObjectURL(page.url);
    onChange(pages.filter((p) => p.id !== id));
  }

  if (editing) {
    return (
      <CropEditor
        bitmap={editing}
        onCancel={() => {
          editing.close();
          setEditing(null);
        }}
        onDone={addPage}
      />
    );
  }

  const hasPages = pages.length > 0;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Photos</h2>
      {!hasPages && <p className="text-sm text-slate-700">Take a photo of each page. Fill the frame and avoid glare.</p>}
      {hasPages && (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {pages.map((p, i) => (
            <li key={p.id} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <img src={p.url} alt={`Page ${i + 1}`} className="h-44 w-full bg-slate-100 object-contain" />
              <button
                type="button"
                aria-label={`Remove page ${i + 1}`}
                onClick={() => remove(p.id)}
                className="absolute right-1.5 top-1.5 grid size-10 place-items-center rounded-full bg-white/95 text-slate-800 shadow transition-colors hover:bg-red-50 hover:text-red-700"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
              <p className="px-3 py-2 text-sm font-medium text-slate-800">Page {i + 1}</p>
              {isBlurry(p.blur) && <p className="px-3 pb-2 text-xs font-medium text-amber-800">Looks blurry. Retake?</p>}
            </li>
          ))}
        </ol>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => void onFile(e)} className="hidden" data-testid="camera-input" />
      <input ref={galleryRef} type="file" accept="image/*" onChange={(e) => void onFile(e)} className="hidden" data-testid="gallery-input" />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => cameraRef.current?.click()} className={hasPages ? secondaryButton : primaryButton}>
          <Camera aria-hidden="true" className="size-5" />
          {hasPages ? "Take another photo" : "Take photo"}
        </button>
        <button type="button" onClick={() => galleryRef.current?.click()} className={secondaryButton}>
          <ImageIcon aria-hidden="true" className="size-5" />
          Choose from gallery
        </button>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className={secondaryButton}>
          Back
        </button>
        <button type="button" disabled={!hasPages} onClick={onNext} className={`${primaryButton} flex-1 sm:flex-none`}>
          Continue
        </button>
      </div>
    </div>
  );
}
