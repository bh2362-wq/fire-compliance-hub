import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Route, Clock, Car, Loader2, Navigation, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, addMinutes, parse } from "date-fns";

interface Visit {
  id: string;
  visit_date: string;
  visit_type: string;
  status: string;
  estimated_hours: number | null;
  site: { id: string; name: string; postcode: string | null } | null;
}

interface PlanStop {
  visit_id: string;
  site_name: string;
  postcode: string;
  visit_type: string;
  estimated_hours: number;
  travel_time_minutes: number;
  travel_distance_km: number;
  order: number;
}

interface RoutePlan {
  plan: PlanStop[];
  locations: Array<{ postcode: string; lat: number; lng: number }>;
  office_postcode: string;
  total_travel_minutes: number;
  total_job_hours: number;
  return_travel_minutes: number;
  return_distance_km: number;
}

const VISIT_TYPE_LABELS: Record<string, string> = {
  quarterly_service: "Quarterly Service",
  biannual_service: "Biannual Service",
  annual_inspection: "Annual Inspection",
  emergency: "Emergency Callout",
  remedial: "Remedial Works",
  installation: "Installation",
  commissioning: "Commissioning",
  survey: "Survey",
  handover: "Handover",
};

const RoutePlanner = () => {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [officePostcode, setOfficePostcode] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [mapApiKey, setMapApiKey] = useState("");
  const { toast } = useToast();

  // Fetch open visits with site postcodes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [visitsRes, settingsRes] = await Promise.all([
        supabase
          .from("visits")
          .select("id, visit_date, visit_type, status, estimated_hours, site:sites(id, name, postcode)")
          .in("status", ["scheduled", "in_progress", "pending"])
          .order("visit_date", { ascending: true }),
        supabase
          .from("company_settings")
          .select("postcode")
          .limit(1)
          .single(),
      ]);

      if (visitsRes.data) {
        setVisits(visitsRes.data.filter((v: any) => v.site?.postcode) as Visit[]);
      }
      if (settingsRes.data?.postcode) {
        setOfficePostcode(settingsRes.data.postcode);
      }

      // Get API key from env for map embed
      setMapApiKey(import.meta.env.VITE_GOOGLE_MAPS_KEY || "");

      setLoading(false);
    };
    fetchData();
  }, []);

  const selectedVisits = useMemo(
    () => visits.filter((v) => selectedIds.has(v.id)),
    [visits, selectedIds]
  );

  const toggleVisit = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === visits.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visits.map((v) => v.id)));
    }
  };

  const handlePlanRoute = async () => {
    if (!officePostcode) {
      toast({ title: "Missing office postcode", description: "Please set your office postcode in company settings.", variant: "destructive" });
      return;
    }
    if (selectedVisits.length < 2) {
      toast({ title: "Select more visits", description: "Select at least 2 visits to plan a route.", variant: "destructive" });
      return;
    }

    setPlanning(true);
    setPlan(null);

    try {
      const { data, error } = await supabase.functions.invoke("plan-route", {
        body: {
          visits: selectedVisits.map((v) => ({
            id: v.id,
            site_name: v.site?.name || "Unknown",
            postcode: v.site?.postcode || "",
            visit_type: v.visit_type,
            estimated_hours: v.estimated_hours || 1,
            visit_date: v.visit_date,
          })),
          office_postcode: officePostcode,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPlan(data as RoutePlan);
    } catch (err: any) {
      toast({ title: "Planning failed", description: err?.message || "Failed to calculate route", variant: "destructive" });
    } finally {
      setPlanning(false);
    }
  };

  // Build a timeline for the plan
  const timeline = useMemo(() => {
    if (!plan) return [];
    const items: Array<{
      type: "travel" | "job" | "return";
      label: string;
      duration: string;
      startTime: string;
      endTime: string;
      postcode?: string;
      visitType?: string;
    }> = [];

    let currentTime = parse(startTime, "HH:mm", new Date());

    for (const stop of plan.plan) {
      // Travel segment
      const travelStart = format(currentTime, "HH:mm");
      currentTime = addMinutes(currentTime, stop.travel_time_minutes);
      const travelEnd = format(currentTime, "HH:mm");

      items.push({
        type: "travel",
        label: `Drive to ${stop.site_name}`,
        duration: `${stop.travel_time_minutes} mins (${stop.travel_distance_km} km)`,
        startTime: travelStart,
        endTime: travelEnd,
      });

      // Job segment
      const jobStart = format(currentTime, "HH:mm");
      currentTime = addMinutes(currentTime, (stop.estimated_hours || 1) * 60);
      const jobEnd = format(currentTime, "HH:mm");

      items.push({
        type: "job",
        label: stop.site_name,
        duration: `${stop.estimated_hours || 1}h`,
        startTime: jobStart,
        endTime: jobEnd,
        postcode: stop.postcode,
        visitType: stop.visit_type,
      });
    }

    // Return to office
    if (plan.return_travel_minutes > 0) {
      const returnStart = format(currentTime, "HH:mm");
      currentTime = addMinutes(currentTime, plan.return_travel_minutes);
      const returnEnd = format(currentTime, "HH:mm");

      items.push({
        type: "return",
        label: "Return to office",
        duration: `${plan.return_travel_minutes} mins (${plan.return_distance_km} km)`,
        startTime: returnStart,
        endTime: returnEnd,
      });
    }

    return items;
  }, [plan, startTime]);

  // Build Google Maps static map URL with waypoints
  const mapUrl = useMemo(() => {
    if (!plan?.locations?.length) return null;
    const apiKey = mapApiKey;
    if (!apiKey) return null;

    const officeLoc = plan.locations.find((l) => l.postcode === plan.office_postcode);
    const markers = plan.plan.map((stop, i) => {
      const loc = plan.locations.find((l) => l.postcode === stop.postcode);
      if (!loc) return "";
      return `markers=color:red%7Clabel:${i + 1}%7C${loc.lat},${loc.lng}`;
    });

    if (officeLoc) {
      markers.unshift(`markers=color:blue%7Clabel:O%7C${officeLoc.lat},${officeLoc.lng}`);
    }

    // Build path
    const pathPoints = [officeLoc, ...plan.plan.map((s) => plan.locations.find((l) => l.postcode === s.postcode)), officeLoc]
      .filter(Boolean)
      .map((l) => `${l!.lat},${l!.lng}`)
      .join("|");

    return `https://maps.googleapis.com/maps/api/staticmap?size=800x400&maptype=roadmap&${markers.join("&")}&path=color:0x4285F4%7Cweight:3%7C${pathPoints}&key=${apiKey}`;
  }, [plan, mapApiKey]);

  // Google Maps directions URL for navigation
  const directionsUrl = useMemo(() => {
    if (!plan?.plan.length) return null;
    const waypoints = plan.plan.map((s) => encodeURIComponent(s.postcode + ", UK")).join("/");
    return `https://www.google.com/maps/dir/${encodeURIComponent(plan.office_postcode + ", UK")}/${waypoints}/${encodeURIComponent(plan.office_postcode + ", UK")}`;
  }, [plan]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Route Planner</h2>
            <p className="text-muted-foreground">Plan optimised engineer routes for open visits</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Visit selection */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Planning Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Office Postcode (Start)</Label>
                  <Input
                    value={officePostcode}
                    onChange={(e) => setOfficePostcode(e.target.value)}
                    placeholder="e.g. SW1A 1AA"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Start Time</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Open Visits ({visits.length})
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs">
                    {selectedIds.size === visits.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (<Skeleton key={i} className="h-14 w-full" />))}
                  </div>
                ) : visits.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No open visits with postcodes found.</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {visits.map((visit) => (
                      <div
                        key={visit.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedIds.has(visit.id) ? "bg-primary/5 border-primary/30" : "bg-card border-border hover:bg-muted/50"
                        }`}
                        onClick={() => toggleVisit(visit.id)}
                      >
                        <Checkbox
                          checked={selectedIds.has(visit.id)}
                          onCheckedChange={() => toggleVisit(visit.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{visit.site?.name}</p>
                          <p className="text-xs text-muted-foreground">{visit.site?.postcode}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {VISIT_TYPE_LABELS[visit.visit_type] || visit.visit_type}
                            </Badge>
                            {visit.estimated_hours && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />{visit.estimated_hours}h
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  className="w-full mt-4"
                  onClick={handlePlanRoute}
                  disabled={planning || selectedVisits.length < 2 || !officePostcode}
                >
                  {planning ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Calculating Route...</>
                  ) : (
                    <><Route className="w-4 h-4 mr-2" />Plan Route ({selectedIds.size} visits)</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Route plan & map */}
          <div className="lg:col-span-2 space-y-4">
            {plan ? (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <Car className="w-5 h-5 mx-auto text-primary mb-1" />
                      <p className="text-lg font-bold">{Math.round(plan.total_travel_minutes)} mins</p>
                      <p className="text-xs text-muted-foreground">Total Travel</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <Clock className="w-5 h-5 mx-auto text-primary mb-1" />
                      <p className="text-lg font-bold">{plan.total_job_hours}h</p>
                      <p className="text-xs text-muted-foreground">On-Site Time</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <MapPin className="w-5 h-5 mx-auto text-primary mb-1" />
                      <p className="text-lg font-bold">{plan.plan.length}</p>
                      <p className="text-xs text-muted-foreground">Stops</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Map */}
                {mapUrl ? (
                  <Card>
                    <CardContent className="p-0 overflow-hidden rounded-lg">
                      <img src={mapUrl} alt="Route map" className="w-full h-auto" />
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Map preview not available (Google Maps API key needed as VITE_GOOGLE_MAPS_KEY)</p>
                      {directionsUrl && (
                        <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="mt-3">
                            <Navigation className="w-4 h-4 mr-2" />
                            Open in Google Maps
                          </Button>
                        </a>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Open in Google Maps button */}
                {directionsUrl && mapUrl && (
                  <div className="flex justify-end">
                    <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm">
                        <Navigation className="w-4 h-4 mr-2" />
                        Open in Google Maps
                      </Button>
                    </a>
                  </div>
                )}

                {/* Timeline */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Day Plan</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-0">
                      {/* Office start */}
                      <div className="flex items-center gap-3 py-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Office — {plan.office_postcode}</p>
                          <p className="text-xs text-muted-foreground">Depart {startTime}</p>
                        </div>
                      </div>

                      {timeline.map((item, i) => (
                        <div key={i} className="relative">
                          {/* Connector line */}
                          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

                          <div className="flex items-start gap-3 py-2 pl-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${
                              item.type === "travel"
                                ? "bg-muted"
                                : item.type === "return"
                                ? "bg-primary/10"
                                : "bg-primary text-primary-foreground"
                            }`}>
                              {item.type === "travel" || item.type === "return" ? (
                                <Car className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <span className="text-xs font-bold">
                                  {plan.plan.findIndex((s) => s.site_name === item.label) + 1}
                                </span>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p className={`text-sm ${item.type === "job" ? "font-medium" : "text-muted-foreground"}`}>
                                  {item.label}
                                </p>
                                <span className="text-xs text-muted-foreground">
                                  {item.startTime} – {item.endTime}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground">{item.duration}</span>
                                {item.visitType && (
                                  <Badge variant="outline" className="text-xs">
                                    {VISIT_TYPE_LABELS[item.visitType] || item.visitType}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Finish time */}
                      {timeline.length > 0 && (
                        <div className="flex items-center gap-3 py-2 pt-3 border-t border-border mt-2">
                          <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-green-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Back at Office</p>
                            <p className="text-xs text-muted-foreground">
                              Estimated finish: {timeline[timeline.length - 1]?.endTime}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="h-full min-h-[400px] flex items-center justify-center">
                <CardContent className="text-center">
                  <Route className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                  <h3 className="text-lg font-medium text-muted-foreground mb-2">No Route Planned</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Select visits from the left panel and click "Plan Route" to generate an optimised day plan with travel times.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default RoutePlanner;
