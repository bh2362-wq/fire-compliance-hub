// Tests for computeBatteryCalc — the BS 5839-1 §25.4 battery sizing
// helper that mirrors the A058 paper-form arithmetic. Pure logic
// worth a regression net since cert PDFs render directly from these
// numbers.

import { describe, expect, it } from "vitest";
import { computeBatteryCalc } from "@/types/bs5839";

describe("computeBatteryCalc — BS 5839-1 §25.4 sizing", () => {
  it("returns null when any input is missing", () => {
    expect(
      computeBatteryCalc({
        standby_current_a: null,
        standby_hours: 24,
        alarm_current_a: 1.2,
      }),
    ).toEqual({ battery_subtotal_ah: null, min_battery_capacity_ah: null });
    expect(
      computeBatteryCalc({
        standby_current_a: 0.1,
        standby_hours: null,
        alarm_current_a: 1.2,
      }),
    ).toEqual({ battery_subtotal_ah: null, min_battery_capacity_ah: null });
    expect(
      computeBatteryCalc({
        standby_current_a: 0.1,
        standby_hours: 24,
        alarm_current_a: null,
      }),
    ).toEqual({ battery_subtotal_ah: null, min_battery_capacity_ah: null });
  });

  it("computes subtotal = (standby × hours) + alarm", () => {
    // 0.1 A × 24 h = 2.4 Ah, + 1.2 A = 3.6 Ah subtotal
    const result = computeBatteryCalc({
      standby_current_a: 0.1,
      standby_hours: 24,
      alarm_current_a: 1.2,
    });
    expect(result.battery_subtotal_ah).toBe(3.6);
  });

  it("computes min capacity = subtotal × 1.25", () => {
    const result = computeBatteryCalc({
      standby_current_a: 0.1,
      standby_hours: 24,
      alarm_current_a: 1.2,
    });
    expect(result.min_battery_capacity_ah).toBe(4.5);
  });

  it("rounds derived values to 2 decimal places", () => {
    // 0.083 × 24 + 1.5 = 1.992 + 1.5 = 3.492 subtotal → 3.49
    // 3.492 × 1.25 = 4.365 → 4.37
    const result = computeBatteryCalc({
      standby_current_a: 0.083,
      standby_hours: 24,
      alarm_current_a: 1.5,
    });
    expect(result.battery_subtotal_ah).toBe(3.49);
    expect(result.min_battery_capacity_ah).toBe(4.37);
  });

  it("handles zero alarm current (silent system)", () => {
    const result = computeBatteryCalc({
      standby_current_a: 0.1,
      standby_hours: 72,
      alarm_current_a: 0,
    });
    // 0.1 × 72 = 7.2, + 0 = 7.2 subtotal
    expect(result.battery_subtotal_ah).toBe(7.2);
    // × 1.25 = 9.0
    expect(result.min_battery_capacity_ah).toBe(9);
  });

  it("handles large-system inputs without floating-point drift", () => {
    // 0.5 A × 72 h = 36 Ah + 5 A = 41 Ah → × 1.25 = 51.25 Ah min
    const result = computeBatteryCalc({
      standby_current_a: 0.5,
      standby_hours: 72,
      alarm_current_a: 5,
    });
    expect(result.battery_subtotal_ah).toBe(41);
    expect(result.min_battery_capacity_ah).toBe(51.25);
  });
});
