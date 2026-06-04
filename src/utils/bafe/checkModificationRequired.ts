// BAFE SP203-1 v8.0.1 — Clause 16.9 Modification certificate
// decision logic.
//
// Engineers often mis-classify a non-addressable → addressable CIE
// swap as a Modification, and BAFE specifically calls this out as
// the trick case. This utility encodes the correct decision:
//
//   1. Non-addressable → addressable CIE change is NOT a
//      Modification. It requires a full new Design / Installation /
//      Commissioning process — three certs, not one. The check
//      short-circuits here so it can't be accidentally overridden
//      by any of the other criteria.
//   2. Replacement of CIE / power supply / repeat panel: Modification.
//   3. Net addition of 10 or more devices: Modification.
//   4. Otherwise: no Modification cert required.
//
// The third return field `requiresFullDIC` distinguishes "no cert
// needed" (everything's fine) from "this is the addressable trap"
// (the engineer must go through D/I/C instead). UI surfaces these
// very differently; collapsing them into a single boolean would lose
// the important nuance.

export interface ModificationCheckInput {
  existingDeviceCount: number;
  newDeviceCount: number;
  replacingCIE: boolean;
  replacingPowerSupply: boolean;
  replacingRepeatPanel: boolean;
  // Specifically: non-addressable CIE being swapped for an
  // addressable one. A like-for-like addressable CIE replacement is
  // captured by replacingCIE, not this flag.
  changingToAddressable: boolean;
}

export interface ModificationCheckResult {
  required: boolean;
  // True when the system change requires a fresh Design /
  // Installation / Commissioning cycle (Clause 16.9 addressable
  // trap). When this is true, `required` is always false because the
  // Modification cert isn't the appropriate output.
  requiresFullDIC: boolean;
  reason: string | null;
}

export function checkModificationRequired(
  input: ModificationCheckInput,
): ModificationCheckResult {
  // Trap case — short-circuit before anything else. The
  // addressable-change outcome dominates every other criterion:
  // even if the engineer is also replacing the PSU and adding 20
  // devices, the right cert path is still full D/I/C, not a
  // Modification.
  if (input.changingToAddressable) {
    return {
      required: false,
      requiresFullDIC: true,
      reason:
        "Non-addressable to addressable CIE change requires full " +
        "Design / Installation / Commissioning process, not a " +
        "Modification certificate (Clause 16.9).",
    };
  }

  const reasons: string[] = [];
  if (input.replacingCIE) reasons.push("CIE replacement");
  if (input.replacingPowerSupply) reasons.push("power supply replacement");
  if (input.replacingRepeatPanel) reasons.push("repeat panel replacement");

  const devicesAdded = input.newDeviceCount - input.existingDeviceCount;
  if (devicesAdded >= 10) {
    reasons.push(`${devicesAdded} devices added`);
  }

  if (reasons.length > 0) {
    return {
      required: true,
      requiresFullDIC: false,
      reason: reasons.join("; "),
    };
  }

  return {
    required: false,
    requiresFullDIC: false,
    reason: null,
  };
}
