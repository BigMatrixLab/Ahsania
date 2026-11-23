import { useSearchParams } from "react-router";
import { useRecords } from "../api/hooks";
import type { Status } from "../api/types";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { ListSkeleton } from "../ui/Skeleton";
import { STATUS_LABEL } from "../ui/StatusBadge";
import { RecordList } from "./RecordList";

export default function AllRecordsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const mine = params.get("mine") === "1";
  const records = useRecords({ status: status || undefined, mine });
  const pick = (value: string) => setParams({ ...(value ? { status: value } : {}), ...(mine ? { mine: "1" } : {}) });
  const options: { value: string; label: string }[] = [{ value: "", label: "All" }, ...(Object.keys(STATUS_LABEL) as Status[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))];

  return (
    <section>
      <PageHeader title={mine ? "My records" : "All records"} subtitle={records.data ? `${records.data.length} ${records.data.length === 1 ? "record" : "records"}${status ? ` · ${STATUS_LABEL[status as Status]?.toLowerCase() ?? status}` : ""}` : undefined} />
      <div role="group" aria-label="Show records that are" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {options.map((o) => {
          const selected = o.value === status;
          return (
            <button
              key={o.value || "all"}
              type="button"
              aria-pressed={selected}
              onClick={() => pick(o.value)}
              className={`inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors ${selected ? "border-brand-700 bg-brand-700 text-white" : "border-ink-300 bg-white text-ink-800 hover:bg-ink-50"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {records.isPending ? (
        <ListSkeleton />
      ) : records.isError ? (
        <Notice tone="error">{records.error.message}</Notice>
      ) : (
        <RecordList records={records.data} empty={status ? "No records with this status." : "No records yet."} />
      )}
    </section>
  );
}
