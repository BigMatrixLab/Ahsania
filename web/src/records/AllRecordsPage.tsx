import { useSearchParams } from "react-router";
import { useRecords } from "../api/hooks";
import type { Status } from "../api/types";
import { Notice } from "../ui/Notice";
import { ListSkeleton } from "../ui/Skeleton";
import { STATUS_LABEL } from "../ui/StatusBadge";
import { inputClass } from "../ui/styles";
import { RecordList } from "./RecordList";

export default function AllRecordsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const mine = params.get("mine") === "1";
  const records = useRecords({ status: status || undefined, mine });
  return (
    <section className="space-y-3">
      <h1 className="text-xl font-bold text-slate-800">{mine ? "My records" : "All records"}</h1>
      <label className="block max-w-xs">
        <span className="text-sm font-medium">Show</span>
        <select value={status} onChange={(e) => setParams({ ...(e.target.value ? { status: e.target.value } : {}), ...(mine ? { mine: "1" } : {}) })} className={inputClass}>
          <option value="">All</option>
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
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
