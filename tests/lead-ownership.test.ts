import { describe, expect, it } from "vitest";

import { LEAD_OWNER_COLUMNS, leadHeldByOther, leadOwnerId } from "@/lib/lead-access.server";
import { leadOwner } from "@/lib/lead-owner";
import { normalizePhone } from "@/lib/ingest-resolve.server";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("lead ownership", () => {
  it("reads either owner column", () => {
    expect(leadOwnerId({ assigned_to: A })).toBe(A);
    expect(leadOwnerId({ assigned_agent_id: A })).toBe(A);
    expect(leadOwnerId({ assigned_to: null, assigned_agent_id: null })).toBeNull();
    expect(leadOwnerId(null)).toBeNull();
  });

  it("blocks another agent even when only the second column is set", () => {
    expect(leadHeldByOther({ assigned_agent_id: A }, B)).toBe(true);
    expect(leadHeldByOther({ assigned_to: A }, B)).toBe(true);
    expect(leadHeldByOther({ assigned_to: A }, A)).toBe(false);
  });

  it("treats an unassigned lead as claimable", () => {
    expect(leadHeldByOther({ assigned_to: null, assigned_agent_id: null }, B)).toBe(false);
  });

  it("keeps the web helper in agreement with the server helper", () => {
    expect(leadOwner({ assigned_to: null, assigned_agent_id: A })).toBe(
      leadOwnerId({ assigned_agent_id: A }),
    );
  });

  it("selects both owner columns everywhere", () => {
    expect(LEAD_OWNER_COLUMNS).toContain("assigned_to");
    expect(LEAD_OWNER_COLUMNS).toContain("assigned_agent_id");
  });
});

describe("phone normalisation (duplicate detection key)", () => {
  it("maps every Bangladeshi form to one canonical number", () => {
    for (const raw of [
      "01712345678",
      "+8801712345678",
      "8801712345678",
      "1712345678",
      "017-1234-5678",
    ]) {
      expect(normalizePhone(raw)).toBe("01712345678");
    }
  });

  it("leaves an unrecognised number untouched instead of inventing digits", () => {
    expect(normalizePhone("12345")).toBe("12345");
  });
});
