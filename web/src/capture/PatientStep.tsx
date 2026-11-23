import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Notice } from "../ui/Notice";
import { inputClass, primaryButton, quietButton, secondaryButton } from "../ui/styles";
import type { PageDraft } from "./types";

/** Mirrors capture.api.schemas.normalize_reg_no on the server. */
export function normalizeRegNo(raw: string): string | null {
  const value = raw.replace(/\s+/g, "").toUpperCase();
  return /^RC[0-9]{1,30}$/.test(value) ? value : null;
}

/** The first patient ID the server finds on the pages, or null (none found, offline, or no OCR on the server). */
export async function readRegNo(pages: PageDraft[]): Promise<string | null> {
  for (const page of pages) {
    const form = new FormData();
    form.append("page", page.blob, "page.jpg");
    try {
      const { reg_no } = await api<{ reg_no: string | null }>("/read-id", { method: "POST", body: form });
      if (reg_no) return reg_no;
    } catch {
      return null;
    }
  }
  return null;
}

interface Props {
  pages: PageDraft[];
  /** Set when the capture started from a patient's page. */
  initialRegNo?: string;
  onBack: () => void;
  /** Throw an Error to show its message here. */
  onUpload: (regNo: string, fillByHand: boolean) => Promise<void>;
}

export function PatientStep({ pages, initialRegNo = "", onBack, onUpload }: Props) {
  const [regNo, setRegNo] = useState(initialRegNo);
  const [reading, setReading] = useState(true);
  const [found, setFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readRegNo(pages).then((value) => {
      if (cancelled) return;
      setReading(false);
      if (value) {
        setRegNo((typed) => typed || value);
        setFound(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pages]);

  async function upload(fillByHand: boolean) {
    const value = normalizeRegNo(regNo);
    if (!value) {
      setError("Patient ID must be RC followed by numbers");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await onUpload(value, fillByHand);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-md space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">Patient ID</h2>
        <p className="mt-0.5 text-sm text-ink-700">We read it from the photos. Check it matches the patient.</p>
      </div>
      <div>
        <label className="block">
          <span className="text-sm font-medium text-ink-800">Patient ID (RC…)</span>
          <input
            value={regNo}
            onChange={(e) => setRegNo(e.target.value)}
            placeholder={reading ? "Reading from the photos…" : "RC12345"}
            autoComplete="off"
            autoCapitalize="characters"
            className={`${inputClass} text-lg font-semibold tabular-nums`}
          />
        </label>
        <div className="mt-2 text-sm">
          {reading && (
            <p role="status" className="flex items-center gap-1.5 text-ink-700">
              <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
              Reading the patient ID from the photos…
            </p>
          )}
          {!reading && found && (
            <p className="flex items-center gap-1.5 font-medium text-brand-800">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Read from the photo. Check it is right.
            </p>
          )}
          {!reading && !found && !regNo && (
            <p className="flex items-center gap-1.5 font-medium text-amber-800">
              <AlertTriangle aria-hidden="true" className="size-4" />
              No patient ID found on the photos. Type it.
            </p>
          )}
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="space-y-2">
        <button type="button" disabled={uploading || !regNo.trim()} onClick={() => void upload(false)} className={`${primaryButton} w-full`}>
          Fill it from the photo
        </button>
        <button type="button" disabled={uploading || !regNo.trim()} onClick={() => void upload(true)} className={`${secondaryButton} w-full`}>
          I'll fill it myself
        </button>
        <button type="button" disabled={uploading} onClick={onBack} className={`${quietButton} w-full`}>
          Back
        </button>
      </div>
      {uploading && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-ink-700">
          <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          Uploading…
        </p>
      )}
    </div>
  );
}
