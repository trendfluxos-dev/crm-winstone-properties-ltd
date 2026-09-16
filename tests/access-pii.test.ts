import { describe, expect, it } from "vitest";

import { isLeadModerator, LEAD_MODERATOR_EMPLOYEE_IDS } from "@/lib/lead-moderators";
import { maskPhone, maskWhen } from "@/lib/pii";

describe("phone masking for supervision surfaces", () => {
  it("keeps a recognisable head and tail but never a dialable number", () => {
    const masked = maskPhone("01712345678");
    expect(masked).toMatch(/^017•+78$/);
    expect(masked).not.toContain("1234");
  });

  it("handles formatting, short input and empty values", () => {
    expect(maskPhone("+880 171-234 5678")).toMatch(/^880•+78$/);
    expect(maskPhone("123")).toBe("••••");
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone("")).toBeNull();
  });
});

describe("lead moderators", () => {
  it("recognises exactly the two existing moderator employee IDs", () => {
    expect(LEAD_MODERATOR_EMPLOYEE_IDS).toHaveLength(2);
    expect(isLeadModerator("WIN2604")).toBe(true);
    expect(isLeadModerator("win2606")).toBe(true);
    expect(isLeadModerator(" WIN2604 ")).toBe(true);
  });

  it("grants nothing to any other account", () => {
    expect(isLeadModerator("WIN2601")).toBe(false);
    expect(isLeadModerator("")).toBe(false);
    expect(isLeadModerator(null)).toBe(false);
  });
});

describe("supervision masking helper", () => {
  it("masks for supervision callers and leaves agent data intact", () => {
    expect(maskWhen(true, "01712345678")).toBe("017••••••78");
    expect(maskWhen(false, "01712345678")).toBe("01712345678");
    expect(maskWhen(true, null)).toBeNull();
  });
});
