import { describe, expect, it } from "vitest";

import { canTransition, currentCycle, cycleFor, nextBillingDate } from "@/lib/service-billing.server";
import { ALLOCATION_ARCHITECT, ALLOCATION_SYSTEM, SERVICE_MONTHLY_AMOUNT } from "@/lib/service-billing";

describe("monthly service billing cycle (Asia/Dhaka, 15th)", () => {
  it("splits the service amount exactly", () => {
    expect(ALLOCATION_SYSTEM + ALLOCATION_ARCHITECT).toBe(SERVICE_MONTHLY_AMOUNT);
  });

  it("runs a cycle from the 15th to the 15th at midnight Dhaka", () => {
    const c = cycleFor("2026-09");
    // 00:00 Dhaka on 15 Sep = 18:00 UTC on 14 Sep.
    expect(c.start).toBe("2026-09-14T18:00:00.000Z");
    expect(c.end).toBe("2026-10-14T18:00:00.000Z");
    expect(c.billingDate).toBe("2026-09-15");
    expect(c.reference).toBe("WINSTONE-SVC-2026-09");
  });

  it("flips to the new cycle only on the 15th, Dhaka time", () => {
    // 14 Sep 23:00 Dhaka = 17:00 UTC — still the August cycle.
    expect(currentCycle(new Date("2026-09-14T17:00:00Z")).month).toBe("2026-08");
    // 15 Sep 00:30 Dhaka = 18:30 UTC on 14 Sep — September cycle.
    expect(currentCycle(new Date("2026-09-14T18:30:00Z")).month).toBe("2026-09");
  });

  it("points at the next 15th", () => {
    expect(nextBillingDate(new Date("2026-09-16T06:00:00Z"))).toBe("2026-10-15");
    expect(nextBillingDate(new Date("2026-09-02T06:00:00Z"))).toBe("2026-09-15");
    expect(nextBillingDate(new Date("2026-12-20T06:00:00Z"))).toBe("2027-01-15");
  });
});

describe("architect payout lifecycle", () => {
  it("allows only the defined transitions", () => {
    expect(canTransition("pending", "approved")).toBe(true);
    expect(canTransition("approved", "ready")).toBe(true);
    expect(canTransition("ready", "paid")).toBe(true);
    expect(canTransition("failed", "approved")).toBe(true);
  });

  it("never jumps straight to paid or moves out of a final state", () => {
    expect(canTransition("pending", "paid")).toBe(false);
    expect(canTransition("approved", "paid")).toBe(false);
    expect(canTransition("paid", "pending")).toBe(false);
    expect(canTransition("cancelled", "approved")).toBe(false);
  });
});
