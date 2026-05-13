/**
 * Reference Guides — Phase 1
 * Interactive knowledge base for engineers. One tab per discipline.
 * Searchable, collapsible sections, visual class/category tables.
 */

import { useState, useMemo } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronDown, ChevronRight, Search, Flame, Zap, Wind, Droplets,
  CheckCircle2, AlertTriangle, BookOpen, Clock, Thermometer, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Collapsible section component ──────────────────────────────────────────────
function Section({ title, children, defaultOpen = false, highlight = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; highlight?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("border rounded-lg overflow-hidden", highlight && "border-primary/30")}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 text-left transition-colors",
          open ? "bg-muted/40" : "hover:bg-muted/20",
          highlight && "bg-primary/5 hover:bg-primary/10"
        )}
      >
        <span className="font-semibold text-sm">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 py-3 text-sm space-y-3 bg-card border-t">{children}</div>}
    </div>
  );
}

// ── Info grid ─────────────────────────────────────────────────────────────────
function InfoGrid({ items }: { items: { label: string; value: string; accent?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {items.map(({ label, value, accent }) => (
        <div key={label} className={cn("rounded-md p-2.5 border", accent ? "bg-primary/5 border-primary/20" : "bg-muted/30")}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn("text-sm font-semibold mt-0.5", accent ? "text-primary" : "")}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Colour-coded table ─────────────────────────────────────────────────────────
function Table({ headers, rows }: { headers: string[]; rows: (string | { text: string; color?: string })[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted border-b">
            {headers.map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
              {row.map((cell, j) => {
                const isObj = typeof cell === "object";
                return (
                  <td key={j} className={cn("px-3 py-2.5 text-foreground", isObj && cell.color)}>
                    {isObj ? cell.text : cell}
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

// ── Checklist ──────────────────────────────────────────────────────────────────
function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Warning box ────────────────────────────────────────────────────────────────
function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 text-sm text-amber-800 dark:text-amber-300">
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
      <div>{children}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FIRE ALARM REFERENCE (BS 5839-1:2025)
// ══════════════════════════════════════════════════════════════════════════════
function FireAlarmGuide() {
  return (
    <div className="space-y-3">
      <Section title="System Categories at a Glance" defaultOpen highlight>
        <Table
          headers={["Category", "Purpose", "Coverage", "Trigger for"]}
          rows={[
            ["M", "Manual only — occupant-operated call points", "Call points only", "Evacuation"],
            ["L1", "Life protection — full coverage", "Whole building + voids ≥800mm", "Earliest possible warning"],
            ["L2", "Life protection — escape routes + high risk", "Escape routes + specified areas", "Life safety"],
            ["L3", "Life protection — escape routes only", "All escape routes", "Safe egress"],
            ["L4", "Life protection — corridors only", "Corridor/circulation areas", "Warning on escape"],
            ["L5", "Life protection — specified areas", "Specific areas of concern", "Targeted life safety"],
            ["P1", "Property protection — full", "Whole building + voids ≥800mm", "Early property alert"],
            ["P2", "Property protection — specified", "Defined areas", "Targeted property"],
          ]}
        />
        <p className="text-xs text-muted-foreground">Higher L/P number = less coverage. L1/P1 = maximum protection. M = manual only.</p>
      </Section>

      <Section title="Inspection Intervals — BS 5839-1 Cl. 45">
        <InfoGrid items={[
          { label: "Category M / L5 / P2", value: "6 monthly", accent: false },
          { label: "Category L1–L4 / P1", value: "6 monthly", accent: true },
          { label: "Small systems (<50 devices)", value: "Annual acceptable", accent: false },
          { label: "Life critical / high risk", value: "Quarterly", accent: false },
          { label: "Category L1 ARC-monitored", value: "6 monthly min.", accent: true },
          { label: "Battery replacement", value: "Manufacturer spec / 4 yrs max", accent: false },
        ]} />
      </Section>

      <Section title="Device Testing Percentages — BS 5839-1 Annex G">
        <Table
          headers={["Method", "Devices Tested", "When Used"]}
          rows={[
            ["100%", "All devices this visit", "Small systems, commissioning, annual"],
            ["50%", "50% each 6-monthly visit", "Medium systems — split across 2 visits"],
            ["25%", "25% each quarterly visit", "Large systems — rotate over 4 visits"],
            ["Risk-based", "Engineer assessment", "Requires documented justification"],
          ]}
        />
        <Warning>If 25% or 50% rotation is used, ALL devices must be tested within a 12-month period. Document which devices are being tested each visit.</Warning>
      </Section>

      <Section title="Common Defect Categories">
        <Table
          headers={["Category", "Definition", "Action Required", "Timescale"]}
          rows={[
            [
              { text: "Cat 1", color: "font-bold text-red-700" },
              "Immediate danger — system ineffective or non-operational",
              "Notify RP immediately, issue written notification",
              { text: "Immediate", color: "text-red-700 font-semibold" },
            ],
            [
              { text: "Cat 2", color: "font-bold text-amber-700" },
              "Non-urgent — system still operational but below standard",
              "Include in service report, notify RP formally",
              { text: "As soon as practicable", color: "text-amber-700" },
            ],
            [
              { text: "Cat 3", color: "font-bold text-green-700" },
              "Advisory — below best practice but not a code breach",
              "Record and advise at next convenient opportunity",
              { text: "Next service", color: "text-green-700" },
            ],
          ]}
        />
      </Section>

      <Section title="Standby Power — Key Requirements">
        <InfoGrid items={[
          { label: "Minimum standby", value: "24 hours quiescent", accent: true },
          { label: "After standby: alarm", value: "30 min full alarm", accent: false },
          { label: "Category M systems", value: "4 hours alarm output", accent: false },
          { label: "Battery life max", value: "4 years (BS 5839-1)", accent: false },
          { label: "Charger check", value: "Voltage + current measured", accent: true },
          { label: "Battery capacity", value: "Calculated per Cl. 26", accent: false },
        ]} />
      </Section>

      <Section title="Fire Alarm — Quick Checklist for Inspection">
        <Checklist items={[
          "Visual inspection of all MCPs — accessible, unobstructed, labelled",
          "All automatic detectors functionally tested (per rotation method)",
          "All manual call points function-tested (break glass element replaced)",
          "All alarm sounders and VADs operated and output verified",
          "Cause and effect confirmed — every input produces correct output",
          "ARC notified before and after test if system is monitored",
          "Battery voltage AND charger voltage measured and recorded",
          "Panel event log reviewed, cleared if appropriate",
          "False alarm record updated",
          "AS-installed drawings verified still current",
          "Logbook updated and countersigned by responsible person",
        ]} />
      </Section>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ASD REFERENCE (BS EN 54-20 / FIA CoP)
// ══════════════════════════════════════════════════════════════════════════════
function ASDGuide() {
  return (
    <div className="space-y-3">
      <Section title="EN 54-20 Sensitivity Classes" defaultOpen highlight>
        <Table
          headers={["Class", "Sensitivity (dB/m)", "Transport Time Limit", "Typical Application"]}
          rows={[
            [
              { text: "Class A", color: "font-bold text-red-700" },
              "≤0.05 dB/m (very high)",
              { text: "≤60 seconds", color: "text-red-700 font-semibold" },
              "Data centres, clean rooms, irreplaceable archives",
            ],
            [
              { text: "Class B", color: "font-bold text-amber-700" },
              "≤0.2 dB/m (high)",
              { text: "≤90 seconds", color: "text-amber-700 font-semibold" },
              "Telecom rooms, server rooms, atria",
            ],
            [
              { text: "Class C", color: "font-bold text-green-700" },
              "≤1.0 dB/m (enhanced)",
              { text: "≤120 seconds", color: "text-green-700 font-semibold" },
              "Heritage buildings, high-bay warehouses, spaces unsuitable for point detectors",
            ],
          ]}
        />
        <Warning>
          Transport time is measured from the furthest sampling hole to the detector. Must be verified with aerosol at commissioning and re-checked after any pipe modification.
        </Warning>
      </Section>

      <Section title="FIA CoP §8.3 — Airflow Maintenance Rule" highlight>
        <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/20 border border-sky-200 space-y-2">
          <p className="font-bold text-sky-800 dark:text-sky-300">±20% Rule</p>
          <p className="text-sm text-sky-700 dark:text-sky-400">
            All maintenance airflow readings must remain within <strong>±20%</strong> of the commissioned baseline. Any reading outside this range must be investigated before the service is signed off.
          </p>
          <div className="text-xs font-mono bg-white dark:bg-sky-950 rounded p-2 border border-sky-200">
            Deviation (%) = |Measured − Baseline| / Baseline × 100<br />
            ✓ Pass: deviation ≤ 20%&nbsp;&nbsp;&nbsp;✗ Fail: deviation &gt; 20%
          </div>
        </div>
        <InfoGrid items={[
          { label: "Baseline set at", value: "Commissioning", accent: true },
          { label: "Acceptable range", value: "±20% of baseline", accent: true },
          { label: "If &gt;20% deviation", value: "Investigate cause", accent: false },
          { label: "Common causes", value: "Blocked holes, broken pipe, filter", accent: false },
          { label: "Record format", value: "L/min (litres/minute)", accent: false },
          { label: "Pipe ID method", value: "Refer to commissioning cert", accent: false },
        ]} />
      </Section>

      <Section title="Signal Levels — VESDA LaserPLUS / LaserFOCUS">
        <Table
          headers={["Signal Level", "Panel Output", "Action Required"]}
          rows={[
            ["Alert", "Relay/SCI output 1", "Investigation — rising smoke trend"],
            ["Action", "Relay/SCI output 2", "Pre-alarm — check area"],
            ["Fire 1", "Fire 1 to CIE loop/zone", "Alarm stage 1 (single detector)"],
            ["Fire 2", "Fire 2 to CIE loop/zone", "Alarm stage 2 (multi-detector or confirmed)"],
            ["Fault", "Fault relay", "System fault — loss of detection"],
          ]}
        />
        <p className="text-xs text-muted-foreground">CIE = Control and Indicating Equipment (the main fire alarm panel). All 5 signal levels must be verified to CIE at commissioning.</p>
      </Section>

      <Section title="Pre-Service Actions (FIA CoP §8)">
        <Checklist items={[
          "Record current airflow readings BEFORE cleaning or service",
          "Download event log from detector — provide copy to site manager",
          "Download configuration file from detector — provide copy to site manager",
          "Review service history and any fault records from last visit",
          "Notify ARC / monitoring station before starting (if monitored)",
          "Obtain access to all pipe runs and sampling holes",
        ]} />
      </Section>

      <Section title="Service Procedure Checklist">
        <Checklist items={[
          "Remove and clean or replace sampling filter",
          "Flush all pipe runs with air — confirm clear",
          "Clean all sampling holes (use pipe cleaner / compressed air)",
          "Clean capillaries if fitted",
          "Record post-service airflow readings on all pipes",
          "Verify all airflow readings within ±20% of baseline",
          "Test Fire 1 and Fire 2 signals at CIE panel",
          "Test Alert and Action outputs if panel supports them",
          "Check fault relay to CIE is functional",
          "Verify power supply and UPS operational",
          "Check battery backup — voltage and charge current",
          "Clear event log after engineer review",
          "Update logbook and have RP countersign",
        ]} />
      </Section>

      <Section title="Common Faults and Diagnosis">
        <Table
          headers={["Fault", "Likely Cause", "Investigation"]}
          rows={[
            ["Low airflow all pipes", "Filter blocked / fan failure", "Replace filter, check fan speed"],
            ["Low airflow one pipe only", "Blocked sampling hole or cracked pipe", "Inspect that pipe run visually"],
            ["High airflow one pipe", "Sampling hole enlarged / pipe separation", "Check all joints on that run"],
            ["Intermittent fault", "Connector corrosion / loose cable", "Check I/O connections and loop address"],
            ["Transport time exceeded", "Blocked sampling holes / pipe obstruction", "Flush and retest"],
            ["Repeated false alarms", "Threshold too sensitive for area", "Review Class setting and thresholds"],
          ]}
        />
      </Section>

      <Section title="Commissioning Tests — EN 54-20 / BS 5839-1 Cl. 45">
        <Checklist items={[
          "Aerosol transport time test from furthest sampling hole",
          "All pipe airflow readings measured and recorded as baseline",
          "Alert → CIE confirmed",
          "Action → CIE confirmed",
          "Fire 1 → CIE confirmed (causes correct alarm zone/address output)",
          "Fire 2 → CIE confirmed",
          "Fault relay → CIE confirmed",
          "Isolate/disable function confirmed at CIE",
          "Panel display shows detector address and status correctly",
          "Design documentation and as-installed pipe drawings provided to RP",
        ]} />
      </Section>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EMERGENCY LIGHTING REFERENCE (BS 5266-1:2016)
// ══════════════════════════════════════════════════════════════════════════════
function ELGuide() {
  return (
    <div className="space-y-3">
      <Section title="System Types" defaultOpen highlight>
        <Table
          headers={["Type", "Operation", "Use Case"]}
          rows={[
            ["Non-maintained", "Only illuminated when normal supply fails", "Most common — offices, retail, schools"],
            ["Maintained", "Continuously illuminated, stays on during failure", "Cinema, theatre, venues where low light used"],
            ["Sustained", "Separate lamp for emergency, mains lamp unaffected", "Used where normal lighting is at reduced level"],
            ["Combined", "Provides normal and emergency from same fitting", "Open plan where uniform light required"],
          ]}
        />
      </Section>

      <Section title="Duration Ratings">
        <InfoGrid items={[
          { label: "Minimum required", value: "1 hour BS 5266-1", accent: false },
          { label: "Typical for premises", value: "3 hours", accent: true },
          { label: "High-risk: cinemas etc.", value: "3 hours", accent: false },
          { label: "Sleeping risk: hotels", value: "3 hours", accent: true },
          { label: "Low occupancy premises", value: "1 hour acceptable", accent: false },
          { label: "Battery replacement", value: "4 years or per manufacturer", accent: false },
        ]} />
      </Section>

      <Section title="EPM6C Notation — Annex M">
        <Table
          headers={["Symbol", "Meaning", "When Used"]}
          rows={[
            [{ text: "✓", color: "text-green-700 font-bold text-base" }, "Satisfactory", "Clause passed with no issues"],
            [{ text: "7", color: "text-amber-700 font-bold text-base" }, "Deviation identified", "Issue found but system still functional — note required"],
            [{ text: "N/A", color: "text-slate-600 font-bold" }, "Not applicable", "Clause does not apply to this installation"],
          ]}
        />
        <Warning>A '7' (deviation) requires a written note explaining the nature of the deviation and whether remedial action is required. It does NOT mean the installation is non-compliant — context matters.</Warning>
      </Section>

      <Section title="Monthly Test Requirements">
        <Checklist items={[
          "Briefly energise each luminaire on simulated mains failure (typically 30 seconds)",
          "Confirm all luminaires and exit signs illuminate",
          "Record test date, duration, and result in log book",
          "Record any failed units with location",
          "Restore mains supply and confirm luminaires return to normal",
          "Log book must be kept on site and available for inspection",
        ]} />
      </Section>

      <Section title="Annual Full Discharge Test">
        <Checklist items={[
          "Disconnect mains supply to emergency lighting circuit",
          "All luminaires must operate for their FULL RATED DURATION without failure",
          "1-hour rated: test for minimum 1 hour",
          "3-hour rated: test for minimum 3 hours",
          "Record number of luminaires tested, passed, and failed",
          "Record any failed units — location and description",
          "Restore mains supply and allow full recharge (typically 24 hours)",
          "Document in log book and on certificate",
        ]} />
        <Warning>The full discharge test must not be performed more frequently than annually as it degrades battery life. Monthly tests should be brief (30 seconds).</Warning>
      </Section>

      <Section title="Common Defects">
        <Table
          headers={["Defect", "Priority", "Standard Ref"]}
          rows={[
            ["Luminaire failed to illuminate on test", { text: "Urgent", color: "text-red-700 font-bold" }, "BS 5266-1 Cl. 6.3"],
            ["Exit sign not legible at 30m", { text: "Urgent", color: "text-red-700 font-bold" }, "BS 5266-1 Cl. 6.2.5"],
            ["Battery capacity below rated duration", { text: "Required", color: "text-amber-700 font-bold" }, "BS 5266-1 Cl. 7.3"],
            ["Luminaire positioned incorrectly", { text: "Required", color: "text-amber-700 font-bold" }, "BS 5266-1 Cl. 6.1"],
            ["Log book not available on site", { text: "Advisory", color: "text-blue-700 font-bold" }, "BS 5266-1 Cl. 12"],
          ]}
        />
      </Section>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DRY RISER REFERENCE (BS 9990:2015)
// ══════════════════════════════════════════════════════════════════════════════
function DryRiserGuide() {
  return (
    <div className="space-y-3">
      <Section title="What is a Dry Riser?" defaultOpen highlight>
        <div className="text-sm space-y-2 text-muted-foreground">
          <p>A dry riser is an unpressurised pipework system installed in a building to allow the Fire & Rescue Service to rapidly pump water to upper floors. The pipe is empty (dry) until the Fire Service connects their pumping appliance to the ground-level inlet.</p>
          <InfoGrid items={[
            { label: "Required when", value: "Building floor level >18m above FRS access", accent: true },
            { label: "Inlet pressure", value: "FRS pumps to 7–12 bar", accent: false },
            { label: "Pipe diameter", value: "Typically 100mm BS 9990", accent: false },
            { label: "Outlet per floor", value: "Landing valve with 65mm Storz", accent: false },
            { label: "Test pressure", value: "12 bar (1,034 kPa)", accent: true },
            { label: "Test duration", value: "15 minutes", accent: true },
          ]} />
        </div>
      </Section>

      <Section title="Inspection Frequencies — BS 9990:2015">
        <Table
          headers={["Test Type", "Frequency", "Clause"]}
          rows={[
            ["Visual inspection", { text: "6 monthly", color: "font-semibold text-blue-700" }, "Cl. 7.2"],
            ["Hydraulic pressure test", { text: "Annual", color: "font-semibold text-blue-700" }, "Cl. 7.3"],
            ["Post-incident inspection", "After any Fire Service use", "Cl. 7.4"],
            ["After modification", "Before return to service", "Cl. 7.5"],
          ]}
        />
      </Section>

      <Section title="Hydraulic Pressure Test Procedure — Cl. 7.3.1.3" highlight>
        <InfoGrid items={[
          { label: "Test pressure", value: "12 bar (minimum)", accent: true },
          { label: "Test duration", value: "15 minutes", accent: true },
          { label: "Max pressure drop", value: "0.5 bar", accent: false },
          { label: "Air release valve", value: "Must be opened first", accent: false },
          { label: "Drain after test", value: "Full drain — all water out", accent: false },
          { label: "Record", value: "Start/end pressure + drop", accent: true },
        ]} />
        <Warning>
          A pressure drop greater than 0.5 bar in 15 minutes indicates a potential leak. The system must NOT be returned to service until the source of leakage is identified and repaired.
        </Warning>
      </Section>

      <Section title="Visual Inspection Checklist — Cl. 7.2">
        <Checklist items={[
          "Inlet cabinet is secure, signage legible, glass panel intact",
          "All blanking caps present and properly secured on breeching outlets",
          "All landing valves are in the CLOSED position",
          "Landing valve handwheels present and undamaged",
          "Valve rubber seals in good condition — no perishing or cracking",
          "No visible corrosion on pipework or fittings",
          "All landing valve boxes undamaged and accessible",
          "Floor level identification signage visible at each landing valve",
          "Air release valve at head of riser is accessible and operational",
          "Drain valve at base of riser is accessible and operational",
          "Inlet access for FRS appliances is clear and unobstructed",
        ]} />
      </Section>

      <Section title="Common Defects">
        <Table
          headers={["Defect", "Priority", "Action"]}
          rows={[
            ["Pressure drop >0.5 bar during test", { text: "Critical", color: "text-red-700 font-bold" }, "Locate and repair leak before return to service"],
            ["Landing valve seized / inoperable", { text: "Urgent", color: "text-red-700 font-bold" }, "Replace valve — notify building manager"],
            ["Blanking caps missing", { text: "Urgent", color: "text-red-700 font-bold" }, "Replace caps — debris ingress compromises system"],
            ["Corroded pipework visible", { text: "Required", color: "text-amber-700 font-bold" }, "Specialist inspection — may need replacement"],
            ["Signage missing/damaged", { text: "Advisory", color: "text-blue-700 font-bold" }, "Replace at next maintenance visit"],
          ]}
        />
      </Section>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
const ALL_CONTENT = {
  "fire-alarm": {
    searchTerms: ["BS 5839", "L1 L2 L3 L4 L5", "M P1 P2", "inspection", "testing", "battery", "defect", "category", "quarterly", "6 monthly", "standby power", "checklist"],
  },
  "asd": {
    searchTerms: ["ASD", "aspirating", "VESDA", "EN 54-20", "Class A B C", "airflow", "transport time", "20%", "baseline", "commissioning", "pipe", "sampling hole", "filter"],
  },
  "emergency-lighting": {
    searchTerms: ["emergency lighting", "BS 5266", "EPM6C", "maintained", "non-maintained", "duration", "3 hour", "1 hour", "monthly test", "discharge", "deviation", "7 notation"],
  },
  "dry-riser": {
    searchTerms: ["dry riser", "BS 9990", "pressure test", "12 bar", "15 minutes", "landing valve", "breeching", "visual inspection", "6 monthly", "annual", "0.5 bar"],
  },
};

export default function ReferenceGuides() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("fire-alarm");

  const tabs = [
    { id: "fire-alarm", label: "Fire Alarm",       icon: Flame,    std: "BS 5839-1:2025", color: "text-red-600",    component: <FireAlarmGuide /> },
    { id: "asd",        label: "ASD",              icon: Wind,     std: "BS EN 54-20",    color: "text-sky-600",   component: <ASDGuide /> },
    { id: "emergency-lighting", label: "Emergency Lighting", icon: Zap, std: "BS 5266-1", color: "text-yellow-600", component: <ELGuide /> },
    { id: "dry-riser",  label: "Dry Riser",        icon: Droplets, std: "BS 9990:2015",   color: "text-blue-600",  component: <DryRiserGuide /> },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 md:p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            Reference Guides
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Quick-reference knowledge base for engineers — standards, inspection requirements and common defects.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search across all guides — e.g. 'transport time', 'Category L2', '±20%'..."
            className="pl-9"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs">
              Clear
            </button>
          )}
        </div>

        {/* Search results hint */}
        {search && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Relevant guides:</span>
            {tabs.map(tab => {
              const q = search.toLowerCase();
              const isRelevant = ALL_CONTENT[tab.id as keyof typeof ALL_CONTENT].searchTerms.some(t => t.toLowerCase().includes(q));
              return isRelevant ? (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={cn("px-2 py-0.5 rounded-full border text-xs font-medium transition-colors",
                    activeTab === tab.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent")}>
                  <tab.icon className={cn("w-3 h-3 inline mr-1", tab.color)} />
                  {tab.label}
                </button>
              ) : null;
            })}
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full md:w-auto grid grid-cols-4 md:flex">
            {tabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-1.5">
                <tab.icon className={cn("w-3.5 h-3.5", tab.color)} />
                <span className="hidden md:inline">{tab.label}</span>
                <span className="md:hidden text-[10px]">{tab.label.split(" ")[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map(tab => (
            <TabsContent key={tab.id} value={tab.id} className="mt-4">
              <div className="flex items-center gap-2 mb-4">
                <tab.icon className={cn("w-5 h-5", tab.color)} />
                <h2 className="text-lg font-bold">{tab.label}</h2>
                <Badge variant="outline" className="text-[10px]">{tab.std}</Badge>
              </div>
              {tab.component}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
