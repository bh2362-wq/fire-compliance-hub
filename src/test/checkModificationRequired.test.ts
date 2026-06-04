// Tests for BAFE SP203-1 Clause 16.9 — Modification certificate
// decision logic. The trap case (non-addressable → addressable CIE
// change) and the additive triggers (CIE / PSU / repeat panel
// replacement, 10+ devices added) are exercised independently and
// in combination.

import { describe, expect, it } from "vitest";
import { checkModificationRequired } from "@/utils/bafe/checkModificationRequired";

const baseline = {
  existingDeviceCount: 50,
  newDeviceCount: 50,
  replacingCIE: false,
  replacingPowerSupply: false,
  replacingRepeatPanel: false,
  changingToAddressable: false,
};

describe("checkModificationRequired — Clause 16.9", () => {
  it("returns not-required for an unchanged system", () => {
    const result = checkModificationRequired(baseline);
    expect(result).toEqual({
      required: false,
      requiresFullDIC: false,
      reason: null,
    });
  });

  describe("addressable trap (the Clause 16.9 gotcha)", () => {
    it("signals full D/I/C — not a Modification — for non-addressable → addressable change", () => {
      const result = checkModificationRequired({
        ...baseline,
        changingToAddressable: true,
      });
      expect(result.required).toBe(false);
      expect(result.requiresFullDIC).toBe(true);
      expect(result.reason).toMatch(/full Design \/ Installation \/ Commissioning/);
    });

    it("short-circuits even when every other criterion is also met", () => {
      // The dominant outcome — the engineer must go through D/I/C
      // regardless of CIE / PSU / repeat panel replacement or
      // device count changes. Without the short-circuit, a careless
      // implementation could classify this as a Modification.
      const result = checkModificationRequired({
        ...baseline,
        changingToAddressable: true,
        replacingCIE: true,
        replacingPowerSupply: true,
        replacingRepeatPanel: true,
        newDeviceCount: 200,
      });
      expect(result.required).toBe(false);
      expect(result.requiresFullDIC).toBe(true);
    });
  });

  describe("replacement triggers", () => {
    it("flags CIE replacement (like-for-like)", () => {
      const result = checkModificationRequired({ ...baseline, replacingCIE: true });
      expect(result.required).toBe(true);
      expect(result.requiresFullDIC).toBe(false);
      expect(result.reason).toMatch(/CIE replacement/);
    });

    it("flags power supply replacement", () => {
      const result = checkModificationRequired({
        ...baseline,
        replacingPowerSupply: true,
      });
      expect(result.required).toBe(true);
      expect(result.reason).toMatch(/power supply replacement/);
    });

    it("flags repeat panel replacement", () => {
      const result = checkModificationRequired({
        ...baseline,
        replacingRepeatPanel: true,
      });
      expect(result.required).toBe(true);
      expect(result.reason).toMatch(/repeat panel replacement/);
    });
  });

  describe("device-count threshold", () => {
    it("flags exactly 10 devices added", () => {
      const result = checkModificationRequired({
        ...baseline,
        newDeviceCount: 60,
      });
      expect(result.required).toBe(true);
      expect(result.reason).toMatch(/10 devices added/);
    });

    it("does NOT flag 9 devices added", () => {
      const result = checkModificationRequired({
        ...baseline,
        newDeviceCount: 59,
      });
      expect(result.required).toBe(false);
      expect(result.reason).toBeNull();
    });

    it("ignores device removal (negative delta)", () => {
      // Clause 16.9 enumerates *additions*. Removing devices may
      // reduce coverage but isn't itself a Modification trigger.
      const result = checkModificationRequired({
        ...baseline,
        existingDeviceCount: 50,
        newDeviceCount: 30,
      });
      expect(result.required).toBe(false);
      expect(result.reason).toBeNull();
    });
  });

  describe("multiple triggers", () => {
    it("joins all triggering reasons in the message", () => {
      const result = checkModificationRequired({
        ...baseline,
        replacingCIE: true,
        replacingRepeatPanel: true,
        newDeviceCount: 70,
      });
      expect(result.required).toBe(true);
      expect(result.reason).toMatch(/CIE replacement/);
      expect(result.reason).toMatch(/repeat panel replacement/);
      expect(result.reason).toMatch(/20 devices added/);
    });
  });
});
