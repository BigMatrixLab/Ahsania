import { Camera, FolderOpen, Image as ImageIcon, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { isBlurry } from "../imaging/blur";
import { isPdf, pdfToPages } from "../imaging/pdf";
import type { PreparedPage } from "../imaging/render";
import { newId } from "../storage/id";
import { Notice } from "../ui/Notice";
import { primaryButton, secondaryButton } from "../ui/styles";
import { CropEditor } from "./CropEditor";
import type { PageDraft } from "./types";

/** The server takes at most 20 pages per record. */
export const MAX_PAGES = 20;

interface Props {
  pages: PageDraft[];
  onChange: (pages: PageDraft[]) => void;
  onBack: () => void;
  onNext: () => void;
}

function toDraft(page: PreparedPage): PageDraft {
  return { id: newId(), blob: page.blob, url: URL.createObjectURL(page.blob), width: page.width, height: page.height, blur: page.blur };
}

export function PhotosStep({ pages, onChange, onBack, onNext }: Props) {
  const [editing, setEditing] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setNote(null);
    if (isPdf(file)) {
      await addPdf(file);
      return;
    }
    try {
      setEditing(await createImageBitmap(file, { imageOrientation: "from-image" }));
    } catch {
      setError("This file could not be opened as a photo or PDF. Try another file, or take a photo.");
    }
  }

  /** Every page of the PDF is added at once, without cropping, up to the page limit. */
  async function addPdf(file: File) {
    setOpening(true);
    try {
      const { pages: added, total } = await pdfToPages(file, MAX_PAGES - pages.length);
      if (added.length === 0) {
        setError("This PDF has no pages.");
        return;
      }
      onChange([...pages, ...added.map(toDraft)]);
      if (total > added.length) setNote(`Only the first ${added.length} of ${total} PDF pages were added. One capture holds at most ${MAX_PAGES} pages.`);
    } catch {
      setError("This PDF could not be opened. It may be damaged or locked with a password.");
    } finally {
      setOpening(false);
    }
  }

  function addPage(page: PreparedPage) {
    editing?.close();
    setEditing(null);
    onChange([...pages, toDraft(page)]);
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
  const full = pages.length >= MAX_PAGES;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-ink-900">Photos</h2>
      {!hasPages && (
        <div className="rounded-xl border border-dashed border-ink-300 bg-white px-5 py-6 text-center">
          <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700">
            <Camera className="size-6" />
          </span>
          <p className="mt-3 font-medium text-ink-900">Take a photo of each page, or add a PDF</p>
          <p className="mt-1 text-sm text-ink-700">Fill the frame, keep the page flat and avoid glare.</p>
        </div>
      )}
      {hasPages && (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {pages.map((p, i) => (
            <li key={p.id} className="relative overflow-hidden rounded-xl border border-ink-200 bg-white">
              <img src={p.url} alt={`Page ${i + 1}`} className="h-44 w-full bg-ink-100 object-contain" />
              <button
                type="button"
                aria-label={`Remove page ${i + 1}`}
                onClick={() => remove(p.id)}
                className="absolute right-1.5 top-1.5 grid size-10 place-items-center rounded-full bg-white/95 text-ink-800 shadow-float transition-colors hover:bg-red-50 hover:text-red-700"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
              <p className="px-3 py-2 text-sm font-medium text-ink-800">Page {i + 1}</p>
              {isBlurry(p.blur) && <p className="mx-3 mb-2.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">Looks blurry. Retake?</p>}
            </li>
          ))}
        </ol>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => void onFile(e)} className="hidden" data-testid="camera-input" />
      <input ref={galleryRef} type="file" accept="image/*" onChange={(e) => void onFile(e)} className="hidden" data-testid="gallery-input" />
      <input ref={filesRef} type="file" accept="image/*,application/pdf,.pdf" onChange={(e) => void onFile(e)} className="hidden" data-testid="files-input" />
      {error && <Notice tone="error">{error}</Notice>}
      {note && <Notice tone="warn">{note}</Notice>}
      {opening && (
        <Notice role="status">
          Opening the PDF…
        </Notice>
      )}
      {full ? (
        <p className="text-sm text-ink-700">{MAX_PAGES} pages added, the most one capture can hold.</p>
      ) : (
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <button type="button" disabled={opening} onClick={() => cameraRef.current?.click()} className={hasPages ? secondaryButton : primaryButton}>
            <Camera aria-hidden="true" className="size-5" />
            {hasPages ? "Take another photo" : "Take photo"}
          </button>
          <button type="button" disabled={opening} onClick={() => galleryRef.current?.click()} className={secondaryButton}>
            <ImageIcon aria-hidden="true" className="size-5" />
            Choose from gallery
          </button>
          <button type="button" disabled={opening} onClick={() => filesRef.current?.click()} className={secondaryButton}>
            <FolderOpen aria-hidden="true" className="size-5" />
            Files or PDF
          </button>
        </div>
      )}
      <div className="flex gap-2 border-t border-ink-200 pt-4">
        <button type="button" onClick={onBack} className={secondaryButton}>
          Back
        </button>
        <button type="button" disabled={!hasPages || opening} onClick={onNext} className={`${primaryButton} flex-1 sm:flex-none`}>
          Continue
        </button>
      </div>
    </div>
  );
}
