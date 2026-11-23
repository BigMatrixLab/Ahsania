import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { TemplateOut } from "../api/types";
import { useCurrentUser } from "../auth/RequireAuth";
import { useOutbox } from "../outbox/OutboxContext";
import { enqueue, flushOutbox, type SendResult } from "../outbox/outbox";
import type { OutboxMeta } from "../storage/idb";
import { PageHeader } from "../ui/PageHeader";
import { PatientStep } from "./PatientStep";
import { PhotosStep } from "./PhotosStep";
import { TemplateStep } from "./TemplateStep";
import type { PageDraft } from "./types";

type Step = "template" | "photos" | "patient";
const STEPS: Step[] = ["template", "photos", "patient"];
const STEP_LABEL: Record<Step, string> = { template: "Form", photos: "Photos", patient: "Patient ID" };

export default function CapturePage() {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const outbox = useOutbox();
  const [step, setStep] = useState<Step>("template");
  const [template, setTemplate] = useState<TemplateOut | null>(null);
  const [pages, setPages] = useState<PageDraft[]>([]);
  const pagesRef = useRef(pages);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(() => () => pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  if (me.role !== "doctor") return <p>Only doctors can capture documents.</p>;

  async function uploadViaOutbox(meta: OutboxMeta) {
    const item = await enqueue(meta, pages.map((p) => p.blob), me.id);
    let result: SendResult | undefined = (await flushOutbox(me.id)).get(item.id);
    if (!result) result = (await flushOutbox(me.id)).get(item.id); // a flush that started earlier did not include it
    await outbox.refresh();
    if (result?.outcome === "done" && result.recordId) {
      navigate(`/records/${result.recordId}`);
    } else if (result?.outcome === "fail") {
      throw new Error(`Upload refused: ${result.error}. It is listed on the home screen.`);
    } else {
      navigate("/", { state: { notice: "Saved on this device — it will upload when the connection is back." } });
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New capture" subtitle={template && step !== "template" ? template.title : "Photograph a report or film, and the form is filled in for you to check."} />
      <ol aria-label="Progress" className="mb-6 grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => {
          const at = STEPS.indexOf(step);
          const state = i < at ? "done" : i === at ? "current" : "todo";
          return (
            <li key={s} aria-current={s === step ? "step" : undefined} className="min-w-0">
              <span className={`block h-1.5 rounded-full transition-colors ${state === "todo" ? "bg-ink-200" : "bg-brand-600"}`} />
              <span className="mt-2 flex items-center gap-2">
                <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${state === "done" ? "bg-brand-600 text-white" : state === "current" ? "bg-brand-700 text-white ring-4 ring-brand-100" : "bg-ink-200 text-ink-600"}`}>
                  {state === "done" ? <Check aria-label="Done" className="size-3.5" /> : i + 1}
                </span>
                <span className={`truncate text-sm ${state === "current" ? "font-semibold text-ink-900" : "text-ink-600"}`}>{STEP_LABEL[s]}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {step === "template" && (
        <TemplateStep
          onBack={() => navigate("/")}
          onDone={(t) => {
            setTemplate(t);
            setStep("photos");
          }}
        />
      )}
      {step === "photos" && template && (
        <PhotosStep pages={pages} onChange={setPages} onBack={() => setStep("template")} onNext={() => setStep("patient")} />
      )}
      {step === "patient" && template && (
        <PatientStep
          pages={pages}
          initialRegNo={params.get("patient") ?? ""}
          onBack={() => setStep("photos")}
          onUpload={(regNo, fillByHand) => uploadViaOutbox({ reg_no: regNo, template_key: template.key, fill_by_hand: fillByHand })}
        />
      )}
    </div>
  );
}
