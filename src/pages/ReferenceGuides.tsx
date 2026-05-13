import { useState, useMemo, useRef } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Search, ChevronDown, ChevronRight,
  Flame, Zap, Wind, Droplets,
  AlertTriangle, CheckCircle2, BookOpen,
  Activity, Shield, Info, X,
} from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const DISC = {
  fa:  { id: "fa",  label: "Fire Alarm",         std: "BS 5839-1:2025",  Icon: Flame,    accent: "#DC2626", gradFrom: "#450a0a", gradTo: "#1c0707" },
  asd: { id: "asd", label: "ASD",                std: "BS EN 54-20",     Icon: Wind,     accent: "#0EA5E9", gradFrom: "#082740", gradTo: "#041520" },
  el:  { id: "el",  label: "Emergency Lighting", std: "BS 5266-1:2016",  Icon: Zap,      accent: "#EAB308", gradFrom: "#3b2700", gradTo: "#1a1100" },
  dr:  { id: "dr",  label: "Dry Riser",          std: "BS 9990:2015",    Icon: Droplets, accent: "#3B82F6", gradFrom: "#0a1f3d", gradTo: "#050f1e" },
} as const;
type DiscKey = keyof typeof DISC;

// ── Primitives ─────────────────────────────────────────────────────────────────

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", accent ? "bg-white/8 border-white/20" : "bg-white/[0.03] border-white/8")}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1">{label}</p>
      <p className={cn("font-mono font-bold text-sm leading-snug", accent ? "text-white" : "text-white/75")}>{value}</p>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-200/90 text-sm leading-snug">
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
      <div>{children}</div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-white/[0.04] border border-white/8 text-white/55 text-sm leading-snug">
      <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-white/30" />
      <div>{children}</div>
    </div>
  );
}

function Check({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm text-white/70 leading-snug">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-green-500/60" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Grid({ headers, rows }: {
  headers: string[];
  rows: (string | { t: string; c?: string })[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/8">
      <table className="w-full text-xs min-w-[500px]">
        <thead>
          <tr className="border-b border-white/8 bg-white/[0.04]">
            {headers.map(h => (
              <th key={h} className="text-left px-3 py-2.5 font-bold uppercase tracking-wide text-white/35 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-white/[0.025] transition-colors">
              {row.map((cell, j) => {
                const isObj = typeof cell === "object";
                return (
                  <td key={j} className={cn("px-3 py-2.5 text-white/65 leading-snug", isObj && cell.c)}>
                    {isObj ? cell.t : cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sec({ title, icon: Icon, open: defaultOpen = false, children }: {
  title: string; icon?: React.ElementType; open?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/8 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left bg-white/[0.025] hover:bg-white/[0.05] transition-colors"
      >
        {Icon && <Icon className="w-4 h-4 text-white/30 flex-shrink-0" />}
        <span className="text-sm font-semibold text-white/85 flex-1">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-white/25" /> : <ChevronRight className="w-4 h-4 text-white/25" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 space-y-4 bg-black/25 border-t border-white/[0.04]">
          {children}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FIRE ALARM
// ══════════════════════════════════════════════════════════════════════════════
function FireAlarm() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat label="Minimum interval" value="6 monthly" accent />
        <Stat label="Max battery age" value="4 years" />
        <Stat label="Standby quiescent" value="24 hours" />
        <Stat label="Alarm on standby" value="30 min minimum" accent />
        <Stat label="Cat M alarm" value="4 h continuous" />
        <Stat label="ARC notification" value="Before + after test" />
      </div>

      <Sec title="System Categories" icon={Shield} open>
        <div className="space-y-1.5">
          {[
            { k: "L1", color: "border-red-500/40 bg-red-500/10 text-red-300",    desc: "Full coverage — all spaces including voids ≥ 800 mm",               note: "Maximum life protection" },
            { k: "L2", color: "border-orange-500/40 bg-orange-500/10 text-orange-300", desc: "Escape routes + high-risk areas",                             note: "Life safety focus" },
            { k: "L3", color: "border-amber-500/40 bg-amber-500/10 text-amber-300",    desc: "All escape routes only",                                      note: "Safe egress coverage" },
            { k: "L4", color: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300", desc: "Corridor / circulation areas only",                            note: "Partial escape coverage" },
            { k: "L5", color: "border-lime-500/40 bg-lime-500/10 text-lime-300",       desc: "Specified areas only — not full escape routes",               note: "Targeted life safety" },
            { k: "M",  color: "border-slate-500/40 bg-slate-500/10 text-slate-300",    desc: "Manual call points only — no automatic detection",            note: "Manual evacuation only" },
            { k: "P1", color: "border-blue-500/40 bg-blue-500/10 text-blue-300",       desc: "Property — full building including voids",                    note: "Insurance / property" },
            { k: "P2", color: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300", desc: "Property — specified areas only",                             note: "Targeted property" },
          ].map(({ k, color, desc, note }) => (
            <div key={k} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg border", color)}>
              <span className="font-mono font-black text-base w-7 flex-shrink-0">{k}</span>
              <div className="min-w-0 flex-1">
                <span className="text-sm text-white/80">{desc}</span>
              </div>
              <span className="text-[10px] text-white/35 whitespace-nowrap hidden sm:block">{note}</span>
            </div>
          ))}
        </div>
        <Note>Higher number = less coverage. L1/P1 = maximum. Systems may combine categories, e.g. L3+P2.</Note>
      </Sec>

      <Sec title="Device Testing Rotation" icon={Activity}>
        <Grid
          headers={["Method", "This Visit", "Full Cycle", "Required Documentation"]}
          rows={[
            [{ t: "100%", c: "font-mono font-bold text-green-400" }, "All devices", "1 visit", "Standard certificate"],
            [{ t: "50%",  c: "font-mono font-bold text-yellow-400" }, "Half of devices", "2 × 6-monthly visits", "Rotation log — which 50%"],
            [{ t: "25%",  c: "font-mono font-bold text-orange-400" }, "Quarter of devices", "4 × quarterly visits", "Rotation log + written justification"],
            [{ t: "Risk", c: "font-mono font-bold text-slate-400" }, "Engineer-assessed", "Documented cycle", "Full written risk assessment on file"],
          ]}
        />
        <Warn>All devices must be tested within any 12-month period regardless of rotation. Untested devices must be listed with a documented reason.</Warn>
      </Sec>

      <Sec title="Defect Categories">
        <div className="space-y-2">
          {[
            { cat: "Cat 1", col: "border-red-500/40 bg-red-500/10",    lbl: "text-red-400",    time: "Immediate",              def: "System non-operational or seriously impaired", action: "Notify RP in writing before leaving site" },
            { cat: "Cat 2", col: "border-amber-500/40 bg-amber-500/10", lbl: "text-amber-400", time: "As soon as practicable", def: "System operational but below standard",        action: "Written notification + recommend remedial quote" },
            { cat: "Cat 3", col: "border-blue-500/40 bg-blue-500/10",   lbl: "text-blue-400",  time: "Next service",           def: "Advisory — no code breach, no impairment",      action: "Record and advise at next visit" },
          ].map(d => (
            <div key={d.cat} className={cn("rounded-lg border p-3 space-y-1.5", d.col)}>
              <div className="flex items-center gap-3">
                <span className={cn("font-mono font-bold text-sm", d.lbl)}>{d.cat}</span>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border", d.col, d.lbl)}>{d.time}</span>
              </div>
              <p className="text-sm text-white/80">{d.def}</p>
              <p className="text-xs text-white/45">{d.action}</p>
            </div>
          ))}
        </div>
      </Sec>

      <Sec title="Standby Power">
        <Grid
          headers={["Requirement", "Value", "Clause"]}
          rows={[
            ["Standby duration", "24 hours quiescent + 30 min full alarm", "Cl. 26"],
            ["Category M alarm", "4 hours continuous alarm output", "Cl. 26.4"],
            ["Battery max age", "4 years (or per manufacturer spec)", "Cl. 26.6"],
            ["Charger verification", "Voltage AND current measured", "Cl. 26.3"],
            ["Capacity calculation", "Load (A) × time (h) × derating factor", "Cl. 26.2"],
          ]}
        />
      </Sec>

      <Sec title="Inspection Checklist">
        <Check items={[
          "Visual check — all MCPs accessible, unobstructed, clearly labelled",
          "Automatic detectors tested per rotation — locations documented on cert",
          "All MCPs tested — break glass element replaced after each test",
          "All sounders and VADs operated, output verified (coverage + volume)",
          "Cause and effect confirmed — every input produces correct output",
          "ARC notified before test start and again on completion",
          "Battery voltage AND charger voltage measured and recorded in volts",
          "Panel event log reviewed — false alarm history extracted and recorded",
          "False alarm section updated — count, causes, actions taken",
          "As-installed drawings verified current — any changes noted",
          "Logbook updated, signed by engineer, countersigned by responsible person",
          "Next service date confirmed with RP and entered in logbook",
        ]} />
      </Sec>

      <Sec title="Common False Alarm Causes">
        <Grid
          headers={["Cause", "Location", "Mitigation"]}
          rows={[
            ["Steam / moisture",       "Kitchens, bathrooms, showers",      "Replace with heat detector; or fit coincidence detection"],
            ["Dust during works",      "Refurbishment areas",               "Isolate detectors during works; post-works recommission"],
            ["Aerosols / sprays",      "Cleaning cupboards, gyms",          "Relocate detector or zone isolation during activities"],
            ["Cooking fumes",          "Staff rooms with microwaves",       "Replace with 78°C heat detector or rate-of-rise"],
            ["Insects",                "Roof voids, loft spaces",           "Install insect screens; consider CO or multi-sensor"],
            ["Test without ARC notice","Any monitored system",              "Enforce pre-test notification SOP for all engineers"],
          ]}
        />
      </Sec>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ASD
// ══════════════════════════════════════════════════════════════════════════════
function ASD() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat label="Class A sensitivity" value="≤ 0.05 dB/m" accent />
        <Stat label="Class B sensitivity" value="≤ 0.2 dB/m" />
        <Stat label="Class C sensitivity" value="≤ 1.0 dB/m" />
        <Stat label="Class A transport max" value="60 s" accent />
        <Stat label="Class B transport max" value="90 s" />
        <Stat label="Class C transport max" value="120 s" />
      </div>

      <Sec title="EN 54-20 Sensitivity Classes" icon={Activity} open>
        <div className="space-y-2">
          {[
            { cls: "A", col: "border-red-500/40 bg-red-500/10",    lbl: "text-red-300",    sens: "≤ 0.05 dB/m", time: "60 s",  apps: "Data centres, clean rooms, irreplaceable archives, museums" },
            { cls: "B", col: "border-amber-500/40 bg-amber-500/10", lbl: "text-amber-300", sens: "≤ 0.2 dB/m",  time: "90 s",  apps: "Telecom / server rooms, switch rooms, atria, heritage buildings" },
            { cls: "C", col: "border-green-500/40 bg-green-500/10", lbl: "text-green-300", sens: "≤ 1.0 dB/m",  time: "120 s", apps: "High-bay warehouses, spaces unsuitable for point detectors" },
          ].map(d => (
            <div key={d.cls} className={cn("rounded-xl border p-3 grid grid-cols-[2.5rem_1fr] gap-3 items-start", d.col)}>
              <span className={cn("font-mono font-black text-3xl leading-none", d.lbl)}>{d.cls}</span>
              <div className="space-y-2">
                <div className="flex gap-4 flex-wrap">
                  <div>
                    <p className="text-[10px] text-white/35 uppercase tracking-wide">Sensitivity</p>
                    <p className={cn("font-mono font-bold text-sm", d.lbl)}>{d.sens}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/35 uppercase tracking-wide">Transport max</p>
                    <p className={cn("font-mono font-bold text-sm", d.lbl)}>{d.time}</p>
                  </div>
                </div>
                <p className="text-sm text-white/65 leading-snug">{d.apps}</p>
              </div>
            </div>
          ))}
        </div>
        <Note>Transport time = time from furthest sampling hole to detector. Verify with aerosol at commissioning and after any pipe change.</Note>
      </Sec>

      <Sec title="FIA CoP §8.3 — ±20% Airflow Rule" open>
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/8 p-4 space-y-3">
          <p className="font-semibold text-sky-300 text-sm">All maintenance airflow readings must be within ±20% of the commissioning baseline.</p>
          <div className="font-mono text-xs bg-black/50 rounded-lg p-3 border border-sky-500/15 space-y-1.5 text-sky-200/80">
            <p>Deviation (%) = |Measured − Baseline| ÷ Baseline × 100</p>
            <p className="text-green-400">✓  PASS  →  deviation ≤ 20%</p>
            <p className="text-red-400">✗  FAIL  →  deviation &gt; 20%  →  investigate before sign-off</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {[
              { label: "Baseline", val: "100 L/min", col: "bg-white/5 border-white/10 text-white/70" },
              { label: "✓  80–120 L/min", val: "Acceptable", col: "bg-green-500/10 border-green-500/25 text-green-300" },
              { label: "✗  <80 or >120", val: "Investigate", col: "bg-red-500/10 border-red-500/25 text-red-300" },
            ].map(c => (
              <div key={c.label} className={cn("rounded-lg border p-2.5", c.col)}>
                <p className="opacity-60 mb-0.5 leading-snug">{c.label}</p>
                <p className="font-bold">{c.val}</p>
              </div>
            ))}
          </div>
        </div>
        <Warn>Record airflow <strong>before AND after</strong> service. The post-service reading is the comparison baseline for the next visit.</Warn>
      </Sec>

      <Sec title="Signal Levels → CIE Panel">
        <Grid
          headers={["Level", "Threshold", "Panel Output", "Action"]}
          rows={[
            [{ t: "Alert",  c: "text-blue-400 font-bold font-mono"   }, "Rising trend", "Relay / SCI output 1",       "Investigate — smoke trend"],
            [{ t: "Action", c: "text-yellow-400 font-bold font-mono" }, "Approaching alarm", "Relay / SCI output 2",  "Pre-alarm — check area"],
            [{ t: "Fire 1", c: "text-orange-400 font-bold font-mono" }, "Single detector", "Zone / address on CIE",   "Stage 1 alarm"],
            [{ t: "Fire 2", c: "text-red-400 font-bold font-mono"    }, "Multi-detector", "Zone / address on CIE",    "Full alarm — evacuate"],
            [{ t: "Fault",  c: "text-slate-400 font-bold font-mono"  }, "System fault", "Fault relay to CIE",         "Engineer attendance"],
          ]}
        />
        <Note>All 5 levels must be verified to CIE at commissioning. Confirm correct zone and address routing for Fire 1 and Fire 2.</Note>
      </Sec>

      <Sec title="Pre-Service Checklist">
        <Check items={[
          "Record current airflow on ALL pipes BEFORE touching anything",
          "Download event log — print or email copy to site manager",
          "Download configuration file — retain on file",
          "Review previous service history for recurring faults",
          "Notify ARC / monitoring station before testing commences",
          "Confirm access to all pipe runs and sampling hole locations",
        ]} />
      </Sec>

      <Sec title="Service Procedure">
        <Check items={[
          "Remove and clean filter — replace if contaminated or past manufacturer life",
          "Flush all pipe runs with filtered compressed air until clear",
          "Clean all sampling holes with pipe cleaner or compressed air",
          "Clean capillaries where fitted",
          "Re-seat detector and confirm fan running",
          "Record post-service airflow on all pipes — verify within ±20% baseline",
          "Test: Alert → CIE output confirmed",
          "Test: Action → CIE output confirmed",
          "Test: Fire 1 → correct zone / address on CIE confirmed",
          "Test: Fire 2 → correct zone / address on CIE confirmed",
          "Test: Fault relay → CIE fault signal confirmed",
          "Check power supply voltage — UPS / battery backup operational",
          "Clear event log after engineer review",
          "Update logbook, countersigned by responsible person",
        ]} />
      </Sec>

      <Sec title="Fault Diagnosis">
        <Grid
          headers={["Symptom", "Likely Cause", "Investigation"]}
          rows={[
            ["Low flow — all pipes",        "Filter blocked / fan degraded",             "Replace filter; check fan speed"],
            ["Low flow — one pipe only",    "Blocked holes or cracked joint",            "Inspect run visually; flush pipe"],
            ["High flow — one pipe",        "Enlarged hole or pipe separation",          "Check all joints; measure hole diameter"],
            ["Intermittent fault",          "Loose connector or corroded I/O terminal",  "Check I/O connections and loop card seating"],
            ["Transport time exceeded",     "Blocked holes reducing flow in critical run","Flush; test from furthest hole with aerosol"],
            ["Repeated false alarms",       "Sensitivity too high for environment",       "Review class setting; check contamination sources"],
          ]}
        />
      </Sec>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EMERGENCY LIGHTING
// ══════════════════════════════════════════════════════════════════════════════
function EL() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat label="Minimum duration" value="1 hour" />
        <Stat label="Typical / sleeping risk" value="3 hours" accent />
        <Stat label="Max battery age" value="4 years" />
        <Stat label="Monthly test" value="≈ 30 seconds" />
        <Stat label="Annual test" value="Full rated duration" accent />
        <Stat label="Sign legibility" value="30 m minimum" />
      </div>

      <Sec title="System Types" icon={Zap} open>
        <div className="space-y-2">
          {[
            { t: "Non-maintained",  col: "border-white/12 bg-white/[0.03]",        def: "Only illuminates when mains fails",                              use: "Offices, retail, schools — most common" },
            { t: "Maintained",      col: "border-yellow-500/35 bg-yellow-500/8",    def: "Continuously illuminated, stays on during failure",              use: "Cinemas, theatres, venues with low ambient light" },
            { t: "Sustained",       col: "border-blue-500/35 bg-blue-500/8",        def: "Separate emergency lamp in same fitting; mains lamp unaffected",  use: "Staged venues with reduced normal illumination" },
            { t: "Combined",        col: "border-purple-500/35 bg-purple-500/8",    def: "Single fitting provides normal + emergency light",               use: "Open-plan where uniform emergency coverage required" },
          ].map(d => (
            <div key={d.t} className={cn("rounded-lg border p-3 space-y-1", d.col)}>
              <p className="font-bold text-sm text-white/85">{d.t}</p>
              <p className="text-sm text-white/65 leading-snug">{d.def}</p>
              <p className="text-xs text-white/35">{d.use}</p>
            </div>
          ))}
        </div>
      </Sec>

      <Sec title="EPM6C Notation — BS 5266-1 Annex M" open>
        <div className="grid grid-cols-3 gap-3">
          {[
            { sym: "✓",   col: "border-green-500/40 bg-green-500/10",   tc: "text-green-400",  label: "Satisfactory", desc: "Clause passed with no issues" },
            { sym: "7",   col: "border-amber-500/40 bg-amber-500/10",   tc: "text-amber-400",  label: "Deviation",    desc: "Issue found — written note required" },
            { sym: "N/A", col: "border-slate-500/40 bg-slate-500/10",   tc: "text-slate-400",  label: "Not Applicable", desc: "Clause does not apply here" },
          ].map(d => (
            <div key={d.sym} className={cn("rounded-xl border p-4 text-center space-y-2", d.col)}>
              <p className={cn("font-mono font-black text-3xl", d.tc)}>{d.sym}</p>
              <p className={cn("font-bold text-xs uppercase tracking-wide", d.tc)}>{d.label}</p>
              <p className="text-xs text-white/45 leading-snug">{d.desc}</p>
            </div>
          ))}
        </div>
        <Warn>A <strong>7</strong> requires a written note explaining the deviation and whether remedial action is needed. It does not automatically mean the installation is non-compliant.</Warn>
      </Sec>

      <Sec title="Key EPM6C Clauses">
        <Grid
          headers={["§", "Clause", "Check"]}
          rows={[
            ["1",  "Luminaires positioned per design drawings",                     "Compare to as-installed drawings"],
            ["2",  "Adequate illumination on escape routes under test",              "Coverage and lux levels confirmed"],
            ["3",  "Signs correctly positioned and legible",                         "Legible from 30 m minimum"],
            ["4",  "All luminaires and signs operational",                           "No failures on simulated mains loss"],
            ["11", "Duration test — all units for full rated period",               "Timed to rated duration without failure"],
            ["12", "System satisfactory under test conditions",                      "Overall pass / fail assessment"],
            ["17", "Log book with commissioning record on site",                     "Physical log book present and signed"],
            ["18", "Monthly and annual records up to date",                          "Continuous log book entries"],
            ["20", "RP trained on monthly test procedure",                           "RP can identify and operate test switch"],
          ]}
        />
      </Sec>

      <Sec title="Monthly Test">
        <Check items={[
          "Energise all luminaires by simulated mains failure for ≈ 30 seconds maximum",
          "Confirm all luminaires and exit signs illuminate during test",
          "Restore mains supply — confirm return to normal standby state",
          "Record test date, duration, result, and any failed units in log book",
          "Log book entry signed and retained on site",
        ]} />
        <Warn>Monthly tests should be brief (≈30 s). Repeated full-duration testing degrades battery life. Save full duration test for the annual discharge.</Warn>
      </Sec>

      <Sec title="Annual Full Discharge Test">
        <Check items={[
          "Disconnect mains supply to emergency lighting circuit",
          "Confirm ALL luminaires energise and remain illuminated",
          "Run for FULL rated duration without intervention (1-hour or 3-hour system)",
          "Record count of luminaires that passed and any that failed before duration",
          "Record location of all failed units",
          "Restore mains and allow full recharge (typically 24 hours)",
          "Document fully in log book and on certificate",
        ]} />
      </Sec>

      <Sec title="Common Defects">
        <Grid
          headers={["Defect", "Priority", "Ref", "Action"]}
          rows={[
            ["Luminaire fails to illuminate",   { t: "Urgent",   c: "text-red-400 font-bold"    }, "Cl. 6.3",   "Replace — escape route unprotected"],
            ["Exit sign not legible at 30 m",   { t: "Urgent",   c: "text-red-400 font-bold"    }, "Cl. 6.2.5", "Replace sign"],
            ["Battery does not reach duration",  { t: "Required", c: "text-amber-400 font-bold"  }, "Cl. 7.3",   "Replace battery — check 4-year rule"],
            ["Luminaire incorrectly positioned", { t: "Required", c: "text-amber-400 font-bold"  }, "Cl. 6.1",   "Reposition or fit additional unit"],
            ["Log book not on site",             { t: "Advisory", c: "text-blue-400 font-bold"   }, "Cl. 12",    "Request RP to locate or establish"],
            ["Monthly tests not recorded",       { t: "Advisory", c: "text-blue-400 font-bold"   }, "Cl. 12",    "Retrain RP on testing requirements"],
          ]}
        />
      </Sec>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DRY RISER
// ══════════════════════════════════════════════════════════════════════════════
function DR() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat label="Visual inspection" value="Every 6 months" accent />
        <Stat label="Pressure test" value="Every 12 months" accent />
        <Stat label="Test pressure" value="12 bar (1,034 kPa)" />
        <Stat label="Test duration" value="15 minutes" />
        <Stat label="Max pressure drop" value="0.5 bar" />
        <Stat label="Standard pipe" value="100 mm bore" />
      </div>

      <Sec title="What is a Dry Riser?" open>
        <p className="text-sm text-white/65 leading-relaxed">
          An unpressurised steel pipework system installed vertically through a building, remaining empty until the Fire &amp; Rescue Service connects a pumping appliance to the ground-level breeching inlet and pumps water up to the floor under attack.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <Stat label="Required when" value="Floor > 18 m above FRS access level" accent />
          <Stat label="FRS inlet type" value="2-way breeching — BS 5041-1" />
          <Stat label="Floor outlet" value="65 mm Storz landing valve" />
          <Stat label="FRS working pressure" value="7–12 bar (pumped)" />
        </div>
      </Sec>

      <Sec title="Inspection Schedule — BS 9990:2015" open>
        <Grid
          headers={["Test Type", "Frequency", "Clause"]}
          rows={[
            [{ t: "Visual inspection",           c: "font-semibold text-white/85" }, { t: "Every 6 months", c: "text-blue-400 font-bold" },  "Cl. 7.2"],
            [{ t: "Hydraulic pressure test",     c: "font-semibold text-white/85" }, { t: "Every 12 months", c: "text-blue-400 font-bold" }, "Cl. 7.3"],
            ["Post-FRS incident inspection",      "After any Fire Service use",                                                               "Cl. 7.4"],
            ["Post-modification inspection",      "After any repair or alteration",                                                          "Cl. 7.5"],
          ]}
        />
      </Sec>

      <Sec title="Hydraulic Pressure Test — Cl. 7.3.1.3">
        <div className="rounded-xl border border-blue-500/25 bg-blue-500/8 p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { l: "Test Pressure", v: "12 bar",   s: "1,034 kPa",   c: "bg-black/40 border-white/10 text-white" },
              { l: "Duration",      v: "15 min",   s: "continuous",  c: "bg-black/40 border-white/10 text-white" },
              { l: "Max Drop",      v: "0.5 bar",  s: "fail if exceeded", c: "bg-red-500/15 border-red-500/30 text-red-300" },
            ].map(d => (
              <div key={d.l} className={cn("rounded-lg border p-3", d.c)}>
                <p className="text-[10px] opacity-50 uppercase tracking-wide mb-1">{d.l}</p>
                <p className="font-mono font-black text-xl">{d.v}</p>
                <p className="text-[10px] opacity-45 mt-0.5">{d.s}</p>
              </div>
            ))}
          </div>
        </div>
        <Warn>A pressure drop &gt; 0.5 bar in 15 minutes indicates a leak. System must NOT return to service until source is located and repaired.</Warn>
        <Check items={[
          "Open air release valve at head of riser before pressurising",
          "Connect test pump — pressurise slowly to 12 bar",
          "Close air release valve when water flows freely",
          "Maintain 12 bar for 15 minutes — record start and end pressure",
          "Inspect all visible joints, fittings and landing valves during test",
          "Fully drain system after test — all water removed",
          "Confirm air release and drain valves operational",
        ]} />
      </Sec>

      <Sec title="Visual Inspection Checklist — Cl. 7.2">
        <Check items={[
          "Inlet cabinet secure, undamaged, signage legible, glass panel intact",
          "All blanking caps present and properly secured on breeching outlets",
          "All landing valves in CLOSED position — handwheels present, undamaged",
          "Valve rubber seals good — no perishing, cracking or splitting",
          "No visible corrosion on pipework, brackets or fittings",
          "Landing valve boxes undamaged, accessible, correctly floor-identified",
          "Floor identification signage visible at each landing valve box",
          "Air release valve at head of riser accessible and operational",
          "Drain valve at base accessible and operational",
          "Inlet access for FRS completely clear and unobstructed",
        ]} />
      </Sec>

      <Sec title="Defect Reference">
        <Grid
          headers={["Defect", "Priority", "Action"]}
          rows={[
            ["Pressure drop > 0.5 bar",         { t: "Critical",  c: "text-red-400 font-bold"    }, "Out of service — locate and repair leak before return"],
            ["Landing valve seized",             { t: "Urgent",   c: "text-red-400 font-bold"    }, "Replace valve. Notify building manager"],
            ["Blanking caps missing",            { t: "Urgent",   c: "text-red-400 font-bold"    }, "Fit replacements — debris ingress prevents FRS connection"],
            ["Inlet cabinet damaged / missing",  { t: "Urgent",   c: "text-amber-400 font-bold"  }, "Secure or replace — inlet must be protected"],
            ["Visible corrosion on pipework",    { t: "Required", c: "text-amber-400 font-bold"  }, "Specialist assessment — may require replacement"],
            ["Signage missing or illegible",     { t: "Advisory", c: "text-blue-400 font-bold"   }, "Replace at next visit"],
          ]}
        />
      </Sec>
    </div>
  );
}

// ── Search keyword index ───────────────────────────────────────────────────────
const KEYWORDS: Record<DiscKey, string[]> = {
  fa:  ["fire alarm","bs 5839","category","l1","l2","l3","l4","l5","m ","p1","p2","device testing","25%","50%","100%","defect","battery","standby","cat 1","cat 2","cat 3","inspection","checklist","false alarm","mcp","detector","rotation"],
  asd: ["asd","aspirating","vesda","en 54-20","class a","class b","class c","airflow","20%","transport time","baseline","filter","sampling","pipe","alert","action","fire 1","fire 2","fault","commissioning","fia","cop"],
  el:  ["emergency lighting","bs 5266","epm6c","maintained","non-maintained","duration","3 hour","1 hour","monthly test","annual discharge","deviation","notation","exit sign","log book","battery"],
  dr:  ["dry riser","bs 9990","pressure test","12 bar","15 minutes","landing valve","breeching","visual inspection","0.5 bar","air release","blanking cap","hydraulic"],
};

const CONTENT: Record<DiscKey, React.ReactNode> = { fa: <FireAlarm />, asd: <ASD />, el: <EL />, dr: <DR /> };

// ══════════════════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function ReferenceGuides() {
  const [active, setActive] = useState<DiscKey>("fa");
  const [search, setSearch] = useState("");

  const q = search.toLowerCase().trim();

  const tabMatches = useMemo<Record<DiscKey, boolean>>(() => {
    if (!q) return { fa: false, asd: false, el: false, dr: false };
    return Object.fromEntries(
      (Object.keys(KEYWORDS) as DiscKey[]).map(k => [
        k,
        KEYWORDS[k].some(kw => kw.includes(q) || q.split(" ").some(w => w.length > 2 && kw.includes(w)))
      ])
    ) as Record<DiscKey, boolean>;
  }, [q]);

  const disc = DISC[active];

  return (
    <DashboardLayout>
      <div className="min-h-screen" style={{ background: "#09090f" }}>

        {/* Discipline header */}
        <div
          className="px-4 md:px-6 pt-6 pb-0 transition-colors duration-300"
          style={{ background: `linear-gradient(135deg, ${disc.gradFrom} 0%, ${disc.gradTo} 100%)` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-3.5 h-3.5 text-white/30" />
            <span className="text-[11px] text-white/30 uppercase tracking-widest font-medium">Reference Guides</span>
          </div>
          <div className="flex items-end gap-3 mb-4">
            <disc.Icon className="w-8 h-8 flex-shrink-0 mb-0.5" style={{ color: disc.accent }} />
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight leading-none">{disc.label}</h1>
              <p className="text-xs text-white/40 mt-1">{disc.std}</p>
            </div>
          </div>

          {/* Tab strip */}
          <div className="flex gap-1 overflow-x-auto">
            {(Object.values(DISC) as typeof DISC[DiscKey][]).map(d => {
              const isActive = d.id === active;
              const hasMatch = q ? tabMatches[d.id as DiscKey] : false;
              return (
                <button
                  key={d.id}
                  onClick={() => setActive(d.id as DiscKey)}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-all rounded-t-lg border-t border-x",
                    isActive
                      ? "bg-[#09090f] text-white border-white/10"
                      : "bg-transparent text-white/45 border-transparent hover:text-white/70 hover:bg-white/[0.05]"
                  )}
                >
                  <d.Icon className="w-3.5 h-3.5 flex-shrink-0" style={isActive ? { color: d.accent } : {}} />
                  <span>{d.label}</span>
                  {hasMatch && !isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0 ml-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search bar */}
        <div className="sticky top-0 z-10 px-4 md:px-6 py-2.5 border-b border-white/[0.06] bg-[#09090f]/90 backdrop-blur-sm">
          <div className="relative max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search all disciplines — e.g. transport time, Cat 2, ±20%, 12 bar…"
              className="pl-9 pr-8 bg-white/[0.05] border-white/8 text-white placeholder:text-white/20 text-sm focus:border-white/20 focus:bg-white/[0.07] h-9"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {q && (
            <p className="text-[11px] text-white/25 mt-1.5">
              {Object.values(tabMatches).filter(Boolean).length === 0
                ? "No matching sections"
                : `Relevant: ${(Object.keys(tabMatches) as DiscKey[]).filter(k => tabMatches[k]).map(k => DISC[k].label).join(" · ")}`}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="px-4 md:px-6 py-5 max-w-3xl">
          {CONTENT[active]}
        </div>
      </div>
    </DashboardLayout>
  );
}
