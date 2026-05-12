import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sparkles, Loader2, FileDown, ChevronLeft, ChevronRight,
  Plus, Trash2, CheckCircle2, AlertTriangle, Info, Brain,
  HardHat, Save,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  createVTB, updateVTB, STANDARD_FA_PPE,
  type VisualTaskBriefing, type VTBRiskLevel, type VTBTaskStep,
  type VTBWorkLocation, type VTBTeamRole, type VTBPPEItem,
} from "@/services/vtbService";
import { generateVTBPDF } from "@/lib/vtbPdfGenerator";
import type { RamsDocument } from "@/services/ramsService";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ramsDocument?: RamsDocument | null;
  onCreated?: () => void;
}

type Step = "setup" | "generating" | "review_steps" | "review_location" |
            "review_team" | "review_ppe" | "review_dos" | "preview";

const STEP_ORDER: Step[] = [
  "setup", "generating", "review_steps", "review_location",
  "review_team", "review_ppe", "review_dos", "preview",
];

const STEP_LABELS: Record<Step, string> = {
  setup:          "1. Setup",
  generating:     "Generating…",
  review_steps:   "2. Task Steps",
  review_location:"3. Work Location",
  review_team:    "4. Team & Roles",
  review_ppe:     "5. PPE",
  review_dos:     "6. Do's & Don'ts",
  preview:        "7. Preview",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

// ── Main component ─────────────────────────────────────────────────────────────

export function VTBGeneratorDialog({ open, onOpenChange, ramsDocument, onCreated }: Props) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>("setup");
  const [saving, setSaving] = useState(false);
  const [vtbId, setVtbId] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState(0);

  // ── Form state ───────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [activity, setActivity] = useState("");
  const [riskLevel, setRiskLevel] = useState<VTBRiskLevel>("Medium");
  const [principalContractor, setPrincipalContractor] = useState("");
  const [clientName, setClientName] = useState("");
  const [projectRef, setProjectRef] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [siteId, setSiteId] = useState<string>("");

  // ── Generated content ────────────────────────────────────────────────────
  const [taskSteps, setTaskSteps] = useState<VTBTaskStep[]>([]);
  const [workLocation, setWorkLocation] = useState<VTBWorkLocation>({
    description: "", access_notes: "", egress_notes: "",
    vehicle_routes: "", exclusion_zones: "", services: "", hazard_areas: "",
  });
  const [teamRoles, setTeamRoles] = useState<VTBTeamRole[]>([]);
  const [ppeRequired, setPpeRequired] = useState<VTBPPEItem[]>(STANDARD_FA_PPE.map(p => ({ ...p })));
  const [dos, setDos] = useState<string[]>([]);
  const [donts, setDonts] = useState<string[]>([]);

  // Load sites for dropdown
  const { data: sites = [] } = useQuery({
    queryKey: ["sites-for-vtb"],
    queryFn: async () => {
      const { data } = await supabase.from("sites").select("id, name, address, customers(name)").eq("status", "active").order("name").limit(200);
      return (data ?? []) as { id: string; name: string; address: string | null; customers: { name: string } | null }[];
    },
    enabled: open,
  });

  // Pre-fill from RAMS document
  useEffect(() => {
    if (!open) { setCurrentStep("setup"); setVtbId(null); return; }
    if (ramsDocument) {
      setTitle(`VTB — ${ramsDocument.title}`);
      setActivity(ramsDocument.title);
      setSiteId(ramsDocument.site_id || "");
      if (ramsDocument.site?.customers?.name) setClientName(ramsDocument.site.customers.name);
    }
  }, [open, ramsDocument]);

  // ── Build context for Claude ──────────────────────────────────────────────

  function buildPromptContext(): string {
    const parts: string[] = [];
    parts.push(`ACTIVITY: ${activity}`);
    parts.push(`RISK LEVEL: ${riskLevel}`);
    const siteName = sites.find(s => s.id === siteId)?.name;
    if (siteName) parts.push(`SITE: ${siteName}`);
    if (clientName) parts.push(`CLIENT / PRINCIPAL CONTRACTOR: ${clientName || principalContractor}`);

    if (ramsDocument) {
      parts.push("\nMETHOD STATEMENTS FROM RAMS:");
      (ramsDocument.method_statements || []).forEach((ms, i) => {
        parts.push(`Step ${ms.step_number}: ${ms.description}. Responsible: ${ms.responsible_person}. Equipment: ${ms.equipment_required}`);
      });

      parts.push("\nHAZARDS FROM RAMS:");
      (ramsDocument.hazards || []).slice(0, 10).forEach(h => {
        parts.push(`- Hazard: ${h.hazard}. Controls: ${h.existing_controls}. Additional: ${h.additional_controls || "none"}`);
      });

      parts.push("\nPPE FROM RAMS:");
      parts.push((ramsDocument.ppe_requirements || []).join(", "));

      if (ramsDocument.site_access_notes) parts.push(`\nSITE ACCESS: ${ramsDocument.site_access_notes}`);
      if (ramsDocument.site_specific_hazards) parts.push(`SITE HAZARDS: ${ramsDocument.site_specific_hazards}`);
      if (ramsDocument.emergency_procedures) parts.push(`EMERGENCY PROCEDURES: ${ramsDocument.emergency_procedures}`);
    }

    return parts.join("\n");
  }

  // ── AI Generation ─────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!activity.trim()) { toast.error("Enter the activity name first"); return; }
    setCurrentStep("generating");
    setGenProgress(10);

    try {
      const context = buildPromptContext();
      setGenProgress(25);

      const systemPromptText = `You are a health & safety document specialist for BHO Fire & Security Ltd, a UK fire alarm contractor. 
You are generating a Visual Task Briefing (VTB) — a document required by principal contractors (such as Berkeley Group / St George) as an Appendix to RAMS.

VTB PURPOSE: Communicate key task information to operatives on-site using simple, direct language supplemented by photos. NOT a full RAMS — focus on what operatives actually need to know at the work face.

Write in plain English. Be specific and practical. Avoid jargon.

Return ONLY this exact JSON, no other text:
{
  "task_steps": [
    {
      "step_number": 1,
      "title": "Short action title (max 6 words)",
      "description": "Clear description of what the operative does in this step. Plain English. Max 3 sentences.",
      "tools_equipment": ["item1", "item2"],
      "safety_note": "The single most important safety point for this step",
      "photo_prompt": "Description of what photo to take at this step to illustrate it"
    }
  ],
  "work_location": {
    "description": "Clear description of the physical work area",
    "access_notes": "How operatives access the work area — specific routes, doors, lifts etc.",
    "egress_notes": "Emergency exit routes from the work area",
    "vehicle_routes": "Vehicle access, parking, delivery areas or N/A",
    "exclusion_zones": "Areas operatives must NOT enter during this work",
    "services": "Known services in the area — fire alarm, electrical, comms, gas etc.",
    "hazard_areas": "Specific hazardous areas to be aware of"
  },
  "team_roles": [
    {
      "role": "Role title",
      "responsible_person": "TBC",
      "competency_required": "What the person must know/be able to do",
      "qualifications": "Specific qualifications, training cards, certificates required"
    }
  ],
  "ppe_required": [
    {
      "item": "PPE item name",
      "mandatory": true,
      "specification": "Standard/spec e.g. EN 397",
      "icon_key": "helmet"
    }
  ],
  "dos": [
    "Specific DO — action-oriented, plain English"
  ],
  "donts": [
    "Specific DON'T — what NOT to do"
  ]
}

Rules:
- 5-8 task steps (more for complex activities, fewer for simple)
- 3-5 team roles including supervisor
- PPE: always include helmet, hiviz, boots for construction sites; add specific items for fire alarm work (e.g. gloves for handling devices)
- 6-10 Do's and 6-10 Don'ts — make them specific to fire alarm work
- Do's/Don'ts should be based on the actual hazards in the RAMS, not generic
- All mandatory PPE for fire alarm contractors on construction sites should be mandatory: true``;

      const { data: fnData, error: fnError } = await supabase.functions.invoke("claude-chat", {
        body: {
          system: systemPromptText,
          model: "claude-sonnet-4-20250514",
          messages: [{ role: "user", content: `Generate a Visual Task Briefing for the following:\n\n${context}` }],
        },
      });

      setGenProgress(70);

      if (fnError) throw new Error(fnError.message || "Edge function error");
      if (fnData?.error) throw new Error(fnData.error);

      const rawText: string = fnData?.content || "";

      let parsed: {
        task_steps: VTBTaskStep[];
        work_location: VTBWorkLocation;
        team_roles: VTBTeamRole[];
        ppe_required: VTBPPEItem[];
        dos: string[];
        donts: string[];
      };

      try {
        parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      } catch {
        throw new Error("AI returned unexpected format — try again");
      }

      setTaskSteps(parsed.task_steps || []);
      setWorkLocation(parsed.work_location || workLocation);
      setTeamRoles(parsed.team_roles || []);
      // Merge AI PPE with our defaults, favouring AI result
      setPpeRequired(parsed.ppe_required?.length ? parsed.ppe_required : STANDARD_FA_PPE.map(p => ({ ...p })));
      setDos(parsed.dos || []);
      setDonts(parsed.donts || []);

      setGenProgress(100);
      toast.success("VTB content generated — review each section");
      setCurrentStep("review_steps");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      toast.error(message);
      setCurrentStep("setup");
    }
  }

  // ── Save to DB ────────────────────────────────────────────────────────────

  async function handleSave(goToPreview = false) {
    if (!user) { toast.error("Not signed in"); return; }
    setSaving(true);
    try {
      const payload: Omit<VisualTaskBriefing, "id" | "vtb_reference" | "created_at" | "updated_at" | "site" | "rams_document"> = {
        title, activity, risk_level: riskLevel,
        status: "draft",
        rams_document_id: ramsDocument?.id || null,
        site_id: siteId || null,
        customer_id: null,
        principal_contractor: principalContractor || null,
        client_name: clientName || null,
        project_reference: projectRef || null,
        prepared_by: preparedBy || null,
        prepared_date: new Date().toISOString().split("T")[0],
        reviewed_by: null,
        version: 1,
        task_steps: taskSteps,
        work_location: workLocation,
        team_roles: teamRoles,
        ppe_required: ppeRequired,
        dos, donts,
        ai_generated: true,
        created_by: user.id,
      };

      if (vtbId) {
        await updateVTB(vtbId, payload);
      } else {
        const created = await createVTB(payload);
        setVtbId(created.id);
      }

      if (goToPreview) setCurrentStep("preview");
      else toast.success("Draft saved");
      onCreated?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Save failed";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePDF() {
    await handleSave(false);
    const vtbData: VisualTaskBriefing = {
      id: vtbId || "draft",
      vtb_reference: "",
      title, activity, risk_level: riskLevel, status: "draft",
      rams_document_id: ramsDocument?.id || null,
      site_id: siteId || null, customer_id: null,
      principal_contractor: principalContractor || null,
      client_name: clientName || null,
      project_reference: projectRef || null,
      prepared_by: preparedBy || null,
      prepared_date: new Date().toISOString().split("T")[0],
      reviewed_by: null, version: 1,
      task_steps: taskSteps, work_location: workLocation,
      team_roles: teamRoles, ppe_required: ppeRequired,
      dos, donts, ai_generated: true,
      created_by: user?.id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      site: sites.find(s => s.id === siteId) ? { name: sites.find(s => s.id === siteId)!.name, address: sites.find(s => s.id === siteId)!.address } : null,
      rams_document: ramsDocument ? { title: ramsDocument.title, rams_number: ramsDocument.rams_number } : null,
    };
    await generateVTBPDF(vtbData);
  }

  // ── Step content ──────────────────────────────────────────────────────────

  function renderSetup() {
    return (
      <div className="space-y-4">
        {ramsDocument && (
          <div className="p-3 rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-200 text-xs">
            <p className="font-semibold text-blue-800 dark:text-blue-300">Linked RAMS: {ramsDocument.rams_number}</p>
            <p className="text-blue-700 dark:text-blue-400 mt-0.5">{ramsDocument.title}</p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs font-semibold">VTB Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. VTB — Fire Alarm Installation at Palantir 20 Soho Square" />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs font-semibold">Activity / Task *</Label>
            <Input value={activity} onChange={e => setActivity(e.target.value)} placeholder="e.g. Installation of fire detection and alarm system" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Risk Level</Label>
            <Select value={riskLevel} onValueChange={v => setRiskLevel(v as VTBRiskLevel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="High">High Risk</SelectItem>
                <SelectItem value="Medium">Medium Risk</SelectItem>
                <SelectItem value="Low">Low Risk</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Site</Label>
            <Select value={siteId || "none"} onValueChange={v => setSiteId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select site…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No site selected</SelectItem>
                {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Principal Contractor</Label>
            <Input value={principalContractor} onChange={e => setPrincipalContractor(e.target.value)} placeholder="e.g. St George / Berkeley Group" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Client Name</Label>
            <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Palantir Technologies" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Project Reference</Label>
            <Input value={projectRef} onChange={e => setProjectRef(e.target.value)} placeholder="e.g. SGF05E-2026-001" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Prepared By</Label>
            <Input value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="Engineer name" />
          </div>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border text-xs text-muted-foreground">
          <p className="font-semibold flex items-center gap-1.5 mb-1"><Brain className="w-3.5 h-3.5" />What AI will generate:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Step-by-step task breakdown with photo prompts and safety notes</li>
            <li>Work plan and location guidance</li>
            <li>Team roles and competency requirements</li>
            <li>PPE list (mandatory and assessed)</li>
            <li>Do's and Don'ts based on {ramsDocument ? "your RAMS hazards" : "fire alarm work best practice"}</li>
          </ul>
          {ramsDocument ? <p className="mt-1 text-blue-600 dark:text-blue-400 font-medium">✓ Using {ramsDocument.method_statements?.length || 0} method statements and {ramsDocument.hazards?.length || 0} hazards from linked RAMS</p>
            : <p className="mt-1 text-amber-600 font-medium">⚠ No RAMS linked — AI will generate from activity description only</p>}
        </div>
      </div>
    );
  }

  function renderStepsReview() {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{taskSteps.length} steps — edit any field, add or remove steps as needed</p>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setTaskSteps(prev => [...prev, { step_number: prev.length + 1, title: "", description: "", tools_equipment: [], safety_note: "", photo_prompt: "" }])}>
            <Plus className="h-3.5 w-3.5" />Add Step
          </Button>
        </div>
        {taskSteps.map((step, idx) => (
          <Card key={idx} className="overflow-hidden">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#1e295a] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{step.step_number}</div>
                <Input value={step.title} onChange={e => { const s = [...taskSteps]; s[idx].title = e.target.value; setTaskSteps(s); }} placeholder="Step title" className="font-semibold text-sm flex-1" />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive flex-shrink-0" onClick={() => setTaskSteps(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <Textarea rows={3} value={step.description} onChange={e => { const s = [...taskSteps]; s[idx].description = e.target.value; setTaskSteps(s); }} placeholder="Step description…" className="text-xs" />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Tools & Equipment (one per line)</Label>
                  <Textarea rows={2} value={step.tools_equipment?.join("\n") || ""} onChange={e => { const s = [...taskSteps]; s[idx].tools_equipment = e.target.value.split("\n").filter(Boolean); setTaskSteps(s); }} className="text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Safety Note</Label>
                  <Textarea rows={2} value={step.safety_note} onChange={e => { const s = [...taskSteps]; s[idx].safety_note = e.target.value; setTaskSteps(s); }} className="text-xs" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Photo Prompt</Label>
                <Input value={step.photo_prompt} onChange={e => { const s = [...taskSteps]; s[idx].photo_prompt = e.target.value; setTaskSteps(s); }} className="text-xs" placeholder="Describe what photo to take here" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  function renderLocationReview() {
    const fields: [keyof VTBWorkLocation, string][] = [
      ["description", "Work Area Description"],
      ["access_notes", "Access to Work Area"],
      ["egress_notes", "Emergency Egress"],
      ["vehicle_routes", "Vehicle / Delivery Routes"],
      ["exclusion_zones", "Exclusion Zones"],
      ["services", "Known Services"],
      ["hazard_areas", "Specific Hazard Areas"],
    ];
    return (
      <div className="space-y-3">
        {fields.map(([k, label]) => (
          <div key={k as string} className="space-y-1.5">
            <Label className="text-xs font-semibold">{label}</Label>
            <Textarea rows={2} value={workLocation[k as keyof VTBWorkLocation] || ""} onChange={e => setWorkLocation(prev => ({ ...prev, [k]: e.target.value }))} className="text-sm" />
          </div>
        ))}
      </div>
    );
  }

  function renderTeamReview() {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setTeamRoles(prev => [...prev, { role: "", responsible_person: "TBC", competency_required: "", qualifications: "" }])}>
            <Plus className="h-3.5 w-3.5" />Add Role
          </Button>
        </div>
        {teamRoles.map((role, idx) => (
          <Card key={idx}><CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input value={role.role} onChange={e => { const r = [...teamRoles]; r[idx].role = e.target.value; setTeamRoles(r); }} placeholder="Role title" className="font-semibold text-sm flex-1" />
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setTeamRoles(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Person (TBC if not assigned)</Label><Input value={role.responsible_person} onChange={e => { const r = [...teamRoles]; r[idx].responsible_person = e.target.value; setTeamRoles(r); }} className="text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Competency Required</Label><Input value={role.competency_required} onChange={e => { const r = [...teamRoles]; r[idx].competency_required = e.target.value; setTeamRoles(r); }} className="text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Qualifications / Certs</Label><Input value={role.qualifications} onChange={e => { const r = [...teamRoles]; r[idx].qualifications = e.target.value; setTeamRoles(r); }} className="text-xs" /></div>
            </div>
          </CardContent></Card>
        ))}
      </div>
    );
  }

  function renderPPEReview() {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground mb-2">Toggle mandatory status and edit specifications. All mandatory items will be highlighted in the PDF.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {ppeRequired.map((ppe, idx) => (
            <div key={idx} className={`flex items-start gap-2 p-2 rounded-lg border ${ppe.mandatory ? "border-green-300/60 bg-green-50 dark:bg-green-950/20" : "border-border"}`}>
              <Checkbox checked={ppe.mandatory} onCheckedChange={v => { const p = [...ppeRequired]; p[idx].mandatory = !!v; setPpeRequired(p); }} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-1 min-w-0">
                <Input value={ppe.item} onChange={e => { const p = [...ppeRequired]; p[idx].item = e.target.value; setPpeRequired(p); }} className="h-6 text-xs font-medium" />
                <Input value={ppe.specification} onChange={e => { const p = [...ppeRequired]; p[idx].specification = e.target.value; setPpeRequired(p); }} className="h-6 text-[10px]" placeholder="Standard / specification" />
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive flex-shrink-0" onClick={() => setPpeRequired(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setPpeRequired(prev => [...prev, { item: "", mandatory: true, specification: "", icon_key: "generic" }])}>
          <Plus className="h-3.5 w-3.5" />Add PPE Item
        </Button>
      </div>
    );
  }

  function renderDosReview() {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-bold text-green-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />Do's ({dos.length})</Label>
          {dos.map((d, idx) => (
            <div key={idx} className="flex gap-1.5">
              <Input value={d} onChange={e => { const a = [...dos]; a[idx] = e.target.value; setDos(a); }} className="text-xs flex-1 border-green-300/60 bg-green-50 dark:bg-green-950/20" />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setDos(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full h-7 text-xs border-green-300/60 text-green-700" onClick={() => setDos(prev => [...prev, ""])}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add Do
          </Button>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-bold text-destructive flex items-center gap-1"><AlertTriangle className="w-4 h-4" />Don'ts ({donts.length})</Label>
          {donts.map((d, idx) => (
            <div key={idx} className="flex gap-1.5">
              <Input value={d} onChange={e => { const a = [...donts]; a[idx] = e.target.value; setDonts(a); }} className="text-xs flex-1 border-red-300/60 bg-red-50 dark:bg-red-950/20" />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setDonts(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full h-7 text-xs border-red-300/60 text-destructive" onClick={() => setDonts(prev => [...prev, ""])}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add Don't
          </Button>
        </div>
      </div>
    );
  }

  function renderPreview() {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl border bg-muted/30 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-sm">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{activity}</p>
            </div>
            <Badge variant="outline" className={riskLevel === "High" ? "border-red-300 text-red-700" : riskLevel === "Medium" ? "border-yellow-300 text-yellow-700" : "border-green-300 text-green-700"}>
              {riskLevel} Risk
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground">Steps:</span> <span className="font-medium">{taskSteps.length}</span></div>
            <div><span className="text-muted-foreground">Team roles:</span> <span className="font-medium">{teamRoles.length}</span></div>
            <div><span className="text-muted-foreground">PPE items:</span> <span className="font-medium">{ppeRequired.length} ({ppeRequired.filter(p => p.mandatory).length} mandatory)</span></div>
            <div><span className="text-muted-foreground">Do's / Don'ts:</span> <span className="font-medium">{dos.length} / {donts.length}</span></div>
            <div><span className="text-muted-foreground">Principal contractor:</span> <span className="font-medium">{principalContractor || "—"}</span></div>
            <div><span className="text-muted-foreground">Prepared by:</span> <span className="font-medium">{preparedBy || "—"}</span></div>
          </div>
        </div>
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 text-xs text-green-800 dark:text-green-300">
          <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
          Ready to generate PDF. The document will include all 5 sections with operative sign-off sheet, photo placeholders, and compliance footer referencing SGG05G.
        </div>
      </div>
    );
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  const reviewSteps: Step[] = ["review_steps", "review_location", "review_team", "review_ppe", "review_dos", "preview"];
  const currentReviewIdx = reviewSteps.indexOf(currentStep);

  function goNext() {
    if (currentStep === "setup") { handleGenerate(); return; }
    if (currentReviewIdx < reviewSteps.length - 1) setCurrentStep(reviewSteps[currentReviewIdx + 1]);
  }
  function goBack() {
    if (currentReviewIdx > 0) setCurrentStep(reviewSteps[currentReviewIdx - 1]);
    else if (currentStep === "review_steps") setCurrentStep("setup");
  }

  const stepNum = currentStep === "setup" ? 1 :
    currentStep === "generating" ? 2 :
    reviewSteps.indexOf(currentStep) + 2;
  const totalSteps = reviewSteps.length + 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <HardHat className="w-5 h-5 text-primary" />
              Visual Task Briefing Generator
              {ramsDocument && <Badge variant="outline" className="text-[10px]">From {ramsDocument.rams_number}</Badge>}
            </DialogTitle>
            <span className="text-xs text-muted-foreground">{STEP_LABELS[currentStep]}</span>
          </div>
          {currentStep !== "generating" && (
            <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
              {(["setup", ...reviewSteps] as Step[]).map((s, i) => (
                <button key={s} onClick={() => { if (s !== "setup" && taskSteps.length === 0) return; setCurrentStep(s); }}
                  className={`text-[9px] px-2 py-1 rounded border whitespace-nowrap transition-colors flex-shrink-0 ${s === currentStep ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent/30"}`}>
                  {STEP_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4">
            {currentStep === "setup" && renderSetup()}
            {currentStep === "generating" && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Brain className="w-12 h-12 text-primary animate-pulse" />
                <div className="text-center space-y-1">
                  <p className="font-semibold">Claude is generating your Visual Task Briefing…</p>
                  <p className="text-sm text-muted-foreground">Analysing {ramsDocument ? `${ramsDocument.method_statements?.length || 0} method statements and ${ramsDocument.hazards?.length || 0} hazards` : "activity details"}</p>
                </div>
                <Progress value={genProgress} className="w-64 h-2" />
                <p className="text-xs text-muted-foreground">This takes 5–15 seconds</p>
              </div>
            )}
            {currentStep === "review_steps" && renderStepsReview()}
            {currentStep === "review_location" && renderLocationReview()}
            {currentStep === "review_team" && renderTeamReview()}
            {currentStep === "review_ppe" && renderPPEReview()}
            {currentStep === "review_dos" && renderDosReview()}
            {currentStep === "preview" && renderPreview()}
          </div>
        </ScrollArea>

        <div className="border-t px-6 py-3 flex items-center justify-between gap-2 flex-shrink-0 bg-background">
          <div className="flex items-center gap-2">
            {currentStep !== "setup" && currentStep !== "generating" && (
              <Button variant="outline" size="sm" onClick={goBack} disabled={saving}>
                <ChevronLeft className="h-4 w-4 mr-1" />Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentStep !== "setup" && currentStep !== "generating" && (
              <Button variant="ghost" size="sm" onClick={() => handleSave()} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />{saving ? "Saving…" : "Save Draft"}
              </Button>
            )}
            {currentStep === "preview" ? (
              <Button onClick={handleGeneratePDF} disabled={saving} className="gap-2">
                <FileDown className="h-4 w-4" />Download PDF
              </Button>
            ) : currentStep !== "generating" ? (
              <Button onClick={goNext} disabled={saving || (!activity.trim() && currentStep === "setup")}>
                {currentStep === "setup" ? (
                  <><Sparkles className="h-4 w-4 mr-1.5" />Generate with AI</>
                ) : (
                  <>Next <ChevronRight className="h-4 w-4 ml-1" /></>
                )}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
