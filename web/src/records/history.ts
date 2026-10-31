import type { EventOut } from "../api/types";

const LABEL: Record<string, string> = {
  upload: "uploaded",
  submit: "approved it and sent it to the admin",
  approve: "approved",
  return: "sent it back",
  reopen: "reopened",
  fill_by_hand: "chose to fill it in by hand",
};

export interface HistoryLine {
  id: number;
  at: string;
  actor: string;
  text: string;
  comment: string | null;
}

const edited = (count: number) => `edited ${count} ${count === 1 ? "field" : "fields"}`;

/** The record's events in plain words. Answers save as the doctor types, so a run of saves reads as one edit. */
export function historyLines(events: EventOut[], uploadText = LABEL.upload): HistoryLine[] {
  const lines: HistoryLine[] = [];
  let run: { line: HistoryLine; paths: Set<string> } | null = null;
  for (const event of events) {
    if (event.action !== "edit") {
      run = null;
      const text = event.action === "upload" ? uploadText : (LABEL[event.action] ?? event.action);
      lines.push({ id: event.id, at: event.created_at, actor: event.actor_name, text, comment: event.comment });
      continue;
    }
    const paths = (event.field_changes ?? []).map((change) => change.path);
    if (run && run.line.actor === event.actor_name) {
      paths.forEach((path) => run!.paths.add(path));
      run.line.at = event.created_at;
      run.line.text = edited(run.paths.size);
    } else {
      const unique = new Set(paths);
      run = { paths: unique, line: { id: event.id, at: event.created_at, actor: event.actor_name, text: edited(unique.size), comment: null } };
      lines.push(run.line);
    }
  }
  return lines;
}
