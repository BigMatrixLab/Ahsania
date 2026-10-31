import { describe, expect, it } from "vitest";
import type { EventOut } from "../api/types";
import { historyLines } from "./history";

function event(id: number, action: string, actor = "Dr. A", extra: Partial<EventOut> = {}): EventOut {
  return { id, action, actor_name: actor, comment: null, created_at: `2026-10-0${id}T10:00:00Z`, field_changes: null, field_flags: null, ...extra };
}

const edit = (id: number, paths: string[], actor = "Dr. A") =>
  event(id, "edit", actor, { field_changes: paths.map((path) => ({ path, old: null, new: "x" })) });

describe("historyLines", () => {
  it("folds a run of saves by one person into a single line", () => {
    const lines = historyLines([event(1, "upload"), edit(2, ["age"]), edit(3, ["age", "sex"]), edit(4, ["ecog"])]);
    expect(lines.map((l) => l.text)).toEqual(["uploaded", "edited 3 fields"]);
    expect(lines[1].at).toBe("2026-10-04T10:00:00Z");
  });

  it("says one field in the singular", () => {
    expect(historyLines([edit(1, ["age"])])[0].text).toBe("edited 1 field");
  });

  it("keeps two people's edits apart", () => {
    const lines = historyLines([edit(1, ["age"], "Dr. A"), edit(2, ["sex"], "Dr. B")]);
    expect(lines.map((l) => l.actor)).toEqual(["Dr. A", "Dr. B"]);
  });

  it("keeps edits apart when something happened between them", () => {
    const lines = historyLines([edit(1, ["age"]), event(2, "return", "Admin", { comment: "fix" }), edit(3, ["age"])]);
    expect(lines.map((l) => l.text)).toEqual(["edited 1 field", "sent it back", "edited 1 field"]);
    expect(lines[1].comment).toBe("fix");
  });

  it("names actions in plain words and shows an unknown one as it is", () => {
    expect(historyLines([event(1, "submit"), event(2, "approve"), event(3, "something_new")]).map((l) => l.text)).toEqual([
      "approved it and sent it to the admin",
      "approved",
      "something_new",
    ]);
  });
});
