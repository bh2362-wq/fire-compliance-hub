import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, RefreshCw, Check, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useGenerateScope, useQuotationFull } from "@/features/quotes/useQuoteGeneration";
import { useSiteIntelligence } from "@/hooks/useSiteIntelligence";
import { intelligenceFieldCount } from "@/services/siteIntelligenceService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotationId: string;
  onAccepted?: () => void;
}

const WORKS_TYPES = [
  { value: "new_install", label: "New install" },
  { value: "upgrade", label: "Upgrade" },
  { value: "takeover", label: "Takeover" },
  { value: "remedial", label: "Remedial" },
  { value: "design_only", label: "Design only" },
];
const CATEGORIES = ["L1", "L2", "L3", "L4", "L5", "M", "P1", "P2"] as const;
const OCCUPANCIES = [
  { value: "sleeping", label: "Sleeping" },
  { value: "non_sleeping", label: "Non-sleeping" },
  { value: "mixed", label: "Mixed" },
];

export function ScopeWriterDialog({ open, onOpenChange, quotationId, onAccepted }: Props) {
  const { data: q } = useQuotationFull(open ? quotationId : undefined);
  const { data: siteIntel } = useSiteIntelligence(open ? q?.site_id : undefined);
  const gen = useGenerateScope();
  const [intelApplied, setIntelApplied] = useState(false);

  const [worksType, setWorksType] = useState("new_install");
  const [category, setCategory] = useState<string>("L2");
  const [manufacturer, setManufacturer] = useState("");
  const [panelType, setPanelType] = useState("");
  const [loops, setLoops] = useState<string>("");
  const [buildingType, setBuildingType] = useState("");
  const [occupancy, setOccupancy] = useState("non_sleeping");
  const [storeys, setStoreys] = useState<string>("");
  const [hasKitchens, setHasKitchens] = useState(false);
  const [hasPlant, setHasPlant] = useState(false);
  const [hasLifts, setHasLifts] = useState(false);
  const [wireless, setWireless] = useState(false);
  const [voiceAlarm, setVoiceAlarm] = useState(false);
  const [bmsInterface, setBmsInterface] = useState(false);
  const [arcSignal, setArcSignal] = useState(false);
  const [liftRecall, setLiftRecall] = useState(false);
  const [siteVisitDate, setSiteVisitDate] = useState("");
  const [existingDesc, setExistingDesc] = useState("");

  const [result, setResult] = useState<{ introduction: string; scope: string[]; generation_id: string | null } | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!q) return;
    setWorksType(q.works_type ?? "new_install");
    setCategory(q.bs5839_category ?? "L2");
    setManufacturer(q.system_manufacturer ?? "");
    setPanelType(q.system_panel ?? "");
    setLoops(q.loop_count?.toString() ?? "");
    setBuildingType(q.building_type ?? "");
    setOccupancy(q.occupancy_type ?? "non_sleeping");
    setStoreys(q.storeys?.toString() ?? "");
    const f = q.system_features ?? {};
    setWireless(!!f.wireless);
    setVoiceAlarm(!!f.voice_alarm);
    setBmsInterface(!!f.bms_interface);
    setArcSignal(!!f.arc_signal);
    setLiftRecall(!!f.lift_recall);
    setSiteVisitDate(q.site_visit_date ?? "");
    setExistingDesc(q.existing_system_description ?? "");
  }, [q]);

  // Layer in harvested site intelligence — only fills blank fields, never overwrites.
  useEffect(() => {
    if (!siteIntel || intelApplied) return;
    let touched = 0;
    if (!manufacturer && siteIntel.panel?.manufacturer) { setManufacturer(siteIntel.panel.manufacturer); touched++; }
    if (!panelType    && siteIntel.panel?.model)        { setPanelType(siteIntel.panel.model);          touched++; }
    if (!loops        && siteIntel.panel?.loops_count)  { setLoops(String(siteIntel.panel.loops_count)); touched++; }
    if (!buildingType && siteIntel.building?.type)      { setBuildingType(siteIntel.building.type);     touched++; }
    if (siteIntel.building?.occupancy && occupancy === "non_sleeping") { setOccupancy(siteIntel.building.occupancy); touched++; }
    if (!storeys      && siteIntel.building?.storeys)   { setStoreys(String(siteIntel.building.storeys)); touched++; }
    if (siteIntel.contract?.category && category === "L2") { setCategory(siteIntel.contract.category); touched++; }
    if (!arcSignal    && siteIntel.features.arc_signal)    { setArcSignal(true);    touched++; }
    if (!voiceAlarm   && siteIntel.features.voice_alarm)   { setVoiceAlarm(true);   touched++; }
    if (!wireless     && siteIntel.features.wireless)      { setWireless(true);     touched++; }
    if (!bmsInterface && siteIntel.features.bms_interface) { setBmsInterface(true); touched++; }
    if (!liftRecall   && siteIntel.features.lift_recall)   { setLiftRecall(true);   touched++; }
    if (touched > 0) setIntelApplied(true);
  }, [siteIntel, intelApplied, manufacturer, panelType, loops, buildingType, occupancy, storeys, category, arcSignal, voiceAlarm, wireless, bmsInterface, liftRecall]);


  const buildInput = () => ({
    works_type: worksType,
    system: {
      category,
      manufacturer: manufacturer || undefined,
      panel_type: panelType || undefined,
      loops: loops ? Number(loops) : undefined,
    },
    building: {
      type: buildingType,
      storeys: storeys ? Number(storeys) : undefined,
      occupancy,
      has_kitchens: hasKitchens,
      has_plant: hasPlant,
      has_lifts: hasLifts,
    },
    features: { wireless, voice_alarm: voiceAlarm, bms_interface: bmsInterface, arc_signal: arcSignal, lift_recall: liftRecall },
    site_visit_date: siteVisitDate || undefined,
    existing_system_description: existingDesc || undefined,
    project_name: q?.title ?? undefined,
    quotation_id: quotationId,
  });

  const runGenerate = async () => {
    if (!buildingType || !category || !occupancy || !worksType) {
      toast.error("Works type, category, building type and occupancy are required");
      return;
    }
    try {
      const r = await gen.mutateAsync(buildInput());
      setResult({ introduction: r.introduction, scope: r.scope, generation_id: r.generation_id });
    } catch (e) {
      const { extractEdgeError } = await import("@/lib/edgeError");
      const detail = await extractEdgeError(e, "Generation failed");
      toast.error("AI scope generation failed", { description: detail, duration: 10000 });
    }
  };

  const accept = async () => {
    if (!result) return;
    setAccepting(true);
    try {
      const { error } = await (supabase as any).from("quotations").update({
        introduction: result.introduction,
        scope: result.scope,
        works_type: worksType,
        occupancy_type: occupancy,
        storeys: storeys ? Number(storeys) : null,
        system_manufacturer: manufacturer || null,
        system_panel: panelType || null,
        bs5839_category: category,
        loop_count: loops ? Number(loops) : null,
        building_type: buildingType || null,
        system_features: { wireless, voice_alarm: voiceAlarm, bms_interface: bmsInterface, arc_signal: arcSignal, lift_recall: liftRecall },
        site_visit_date: siteVisitDate || null,
        existing_system_description: existingDesc || null,
      }).eq("id", quotationId);
      if (error) throw error;
      if (result.generation_id) {
        await (supabase as any).from("scope_generations").update({ accepted: true }).eq("id", result.generation_id);
      }
      toast.success("Scope saved to quotation");
      onAccepted?.();
      onOpenChange(false);
      setResult(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> AI Scope Writer — BS 5839-1:2025</DialogTitle>
        </DialogHeader>

        {!result && (
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Works type</Label>
                <Select value={worksType} onValueChange={setWorksType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{WORKS_TYPES.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Manufacturer</Label>
                <Input value={manufacturer} onChange={e => setManufacturer(e.target.value)} placeholder="e.g. Advanced, Kentec" />
              </div>
              <div>
                <Label>Panel type</Label>
                <Input value={panelType} onChange={e => setPanelType(e.target.value)} placeholder="e.g. MxPro 5" />
              </div>
              <div>
                <Label>Loop count</Label>
                <Input type="number" value={loops} onChange={e => setLoops(e.target.value)} />
              </div>
              <div>
                <Label>Building type</Label>
                <Input value={buildingType} onChange={e => setBuildingType(e.target.value)} placeholder="e.g. Care home, office, hotel" />
              </div>
              <div>
                <Label>Occupancy</Label>
                <Select value={occupancy} onValueChange={setOccupancy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OCCUPANCIES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Storeys</Label>
                <Input type="number" value={storeys} onChange={e => setStoreys(e.target.value)} />
              </div>
              <div>
                <Label>Site visit date</Label>
                <Input type="date" value={siteVisitDate} onChange={e => setSiteVisitDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={hasKitchens} onCheckedChange={v => setHasKitchens(!!v)} /> Kitchens</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={hasPlant} onCheckedChange={v => setHasPlant(!!v)} /> Plant rooms</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={hasLifts} onCheckedChange={v => setHasLifts(!!v)} /> Lifts</label>
            </div>

            <div>
              <Label className="text-xs uppercase text-muted-foreground">Features</Label>
              <div className="grid grid-cols-3 gap-3 mt-1">
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={wireless} onCheckedChange={v => setWireless(!!v)} /> Wireless</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={voiceAlarm} onCheckedChange={v => setVoiceAlarm(!!v)} /> Voice alarm</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={bmsInterface} onCheckedChange={v => setBmsInterface(!!v)} /> BMS interface</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={arcSignal} onCheckedChange={v => setArcSignal(!!v)} /> ARC signalling</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={liftRecall} onCheckedChange={v => setLiftRecall(!!v)} /> Lift recall</label>
              </div>
            </div>

            <div>
              <Label>Existing system description (optional)</Label>
              <Textarea value={existingDesc} onChange={e => setExistingDesc(e.target.value)} rows={3} placeholder="For upgrades/takeovers — describe the existing system." />
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Introduction</Label>
              <div className="mt-1 p-3 rounded-md border bg-muted/30 text-sm whitespace-pre-wrap">{result.introduction}</div>
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Scope ({result.scope.length} paragraphs)</Label>
              <div className="mt-1 space-y-2">
                {result.scope.map((p, i) => (
                  <div key={i} className="p-3 rounded-md border bg-muted/30 text-sm whitespace-pre-wrap">{p}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <div className="flex gap-2">
            {result ? (
              <>
                <Button variant="outline" onClick={() => { setResult(null); }} disabled={gen.isPending || accepting}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Edit inputs
                </Button>
                <Button variant="outline" onClick={runGenerate} disabled={gen.isPending || accepting}>
                  {gen.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />} Regenerate
                </Button>
                <Button onClick={accept} disabled={accepting}>
                  {accepting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />} Accept &amp; save
                </Button>
              </>
            ) : (
              <Button onClick={runGenerate} disabled={gen.isPending}>
                {gen.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />} Generate scope
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
