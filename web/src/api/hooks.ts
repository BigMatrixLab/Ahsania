import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "./client";
import type { Account, HospitalPatient, Me, PatientDetail, PatientSummary, RecordDetail, RecordSummary, TemplateOut } from "./types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<Me>("/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function useTemplates() {
  return useQuery({ queryKey: ["templates"], queryFn: () => api<TemplateOut[]>("/templates"), staleTime: 300_000 });
}

/** Look again soon: the document is still being read, or an approved hospital record awaits the hospital's answer. */
export function needsPolling(record: RecordDetail | undefined): boolean {
  if (!record) return false;
  if (record.status === "processing") return true;
  return record.status === "approved" && Boolean(record.template.definition.hospital) && !record.hospital_sync;
}

export function useRecord(id: string) {
  return useQuery({
    queryKey: ["record", id],
    queryFn: () => api<RecordDetail>(`/records/${id}`),
    refetchInterval: (query) => (needsPolling(query.state.data) ? 1500 : false),
  });
}

export interface RecordFilter {
  status?: string;
  mine?: boolean;
  reg_no?: string;
}

export function useRecords(filter: RecordFilter, enabled = true) {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.mine) params.set("mine", "true");
  if (filter.reg_no) params.set("reg_no", filter.reg_no);
  return useQuery({
    queryKey: ["records", filter],
    queryFn: () => api<RecordSummary[]>(`/records?${params}`),
    enabled,
  });
}

export function usePatients() {
  return useQuery({ queryKey: ["patients"], queryFn: () => api<PatientSummary[]>("/patients") });
}

export function usePatient(regNo: string) {
  return useQuery({ queryKey: ["patients", regNo], queryFn: () => api<PatientDetail>(`/patients/${encodeURIComponent(regNo)}`) });
}

export function useAccounts(enabled: boolean) {
  return useQuery({ queryKey: ["accounts"], queryFn: () => api<Account[]>("/admin/users"), enabled });
}

/** The hospital system's patients for one form; no retries, so "hospital down" shows at once. */
export function useHospitalPatients(form: string) {
  return useQuery({
    queryKey: ["hospital-patients", form],
    queryFn: () => api<HospitalPatient[]>(`/hospital/patients?form=${encodeURIComponent(form)}`),
    retry: false,
  });
}
