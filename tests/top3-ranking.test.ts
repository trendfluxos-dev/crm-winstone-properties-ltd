import { describe, expect, it } from "vitest";

import { __rankTop3ForTests as rankTop3, type TeamDailyRow } from "@/lib/daily-performance.server";

function row(over: Partial<TeamDailyRow> & { agentId: string }): TeamDailyRow {
  return {
    dayKey: "2026-09-16",
    callsMade: 0,
    connected: 0,
    interested: 0,
    followUpsDue: 0,
    followUpsCompleted: 0,
    siteVisits: null,
    reportsSubmitted: 0,
    talkSeconds: 0,
    pendingReport: false,
    agentName: over.agentId,
    employeeId: over.agentId,
    ...over,
  } as TeamDailyRow;
}

describe("daily top 3 ranking", () => {
  it("returns nothing when nobody worked today", () => {
    expect(rankTop3([row({ agentId: "WIN2601" }), row({ agentId: "WIN2602" })])).toEqual([]);
  });

  it("caps the list at three agents with real activity", () => {
    const rows = ["A", "B", "C", "D"].map((id, i) =>
      row({ agentId: id, callsMade: 10 - i, connected: 10 - i }),
    );
    const top = rankTop3(rows);
    expect(top).toHaveLength(3);
    expect(top.map((r) => r.agentId)).toEqual(["A", "B", "C"]);
  });

  it("weights connected and interested above raw call volume", () => {
    const dialer = row({ agentId: "DIAL", callsMade: 20, connected: 2, interested: 0 });
    const closer = row({ agentId: "CLOSE", callsMade: 12, connected: 11, interested: 6 });
    expect(rankTop3([dialer, closer])[0]?.agentId).toBe("CLOSE");
  });

  it("breaks an exact tie on employee id ascending", () => {
    const a = row({ agentId: "WIN2606", callsMade: 5, connected: 3 });
    const b = row({ agentId: "WIN2604", callsMade: 5, connected: 3 });
    expect(rankTop3([a, b]).map((r) => r.agentId)).toEqual(["WIN2604", "WIN2606"]);
  });
});
