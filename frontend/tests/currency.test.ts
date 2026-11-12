import { describe, expect, it } from "vitest";
import { money, usdMoney, parseDonation } from "@/lib/format";
import { INR_RATE_DATE, INR_REFERENCE_RATE } from "@/lib/currency";
describe("INR display estimates and USD settlement", () => {
  it("converts USD cents using the dated reference without an approximation symbol", () => {
    expect(INR_REFERENCE_RATE).toBe(94.05);
    expect(INR_RATE_DATE).toBe("2026-11-12");
    expect(money(42500)).toBe("₹39,971.25");
    expect(money(1500)).toBe("₹1,410.75");
    expect(money(0)).toBe("₹0.00");
    expect(money(1500)).not.toContain("≈");
  });
  it("retains USD cents for donation input and original payment values", () => {
    expect(parseDonation("15.00")).toBe(1500);
    expect(usdMoney(1500)).toBe("$15.00");
    expect(usdMoney(101)).toBe("$1.01");
  });
});
