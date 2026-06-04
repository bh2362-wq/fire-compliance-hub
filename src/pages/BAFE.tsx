/**
 * BAFE.tsx
 *
 * Landing page for the BAFE SP203-1 compliance module. Composes the
 * five components built in PRs #142-143 into a single tabbed surface
 * so the engineer / admin can move between the live triage view
 * and the per-area registers without leaving the page.
 *
 * Tabs:
 *   Compliance      - BAFEComplianceDashboard (default)
 *   Lead Individuals - BAFELeadIndividualsPanel
 *   Certificates    - BAFECertificateRegister
 *   Maintenance     - BAFEMaintenanceContractPanel
 *   Sub-contractors - BAFESubcontractorRegister
 *
 * The Dashboard's onAlertClick callback maps each alert kind to the
 * tab that surfaces its source so the engineer can act on the
 * finding without manually navigating.
 */

import { useState, useCallback } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck } from "lucide-react";
import { BAFEComplianceDashboard } from "@/components/bafe/BAFEComplianceDashboard";
import { BAFELeadIndividualsPanel } from "@/components/bafe/BAFELeadIndividualsPanel";
import { BAFECertificateRegister } from "@/components/bafe/BAFECertificateRegister";
import { BAFEMaintenanceContractPanel } from "@/components/bafe/BAFEMaintenanceContractPanel";
import { BAFESubcontractorRegister } from "@/components/bafe/BAFESubcontractorRegister";
import type { BafeAlertKind, BafeComplianceAlert } from "@/types/bafe";

type TabKey = "dashboard" | "leads" | "certs" | "maintenance" | "subs";

// Alert kind → tab routing. Lets the dashboard's "jump to source"
// click move the engineer straight to the register that hosts the
// offending row. Centralised so a new alert kind only needs one
// edit when it's added to BafeAlertKind.
const ALERT_TO_TAB: Record<BafeAlertKind, TabKey> = {
  lead_departed_30d:        "leads",
  lead_gap_90d:             "leads",
  no_lead_for_certified:    "leads",
  cert_overdue:             "certs",
  bs5839_cert_missing:      "certs",
  ms_review_due:            "dashboard",
  subcontractor_expired:    "subs",
  subcontractor_expiring:   "subs",
  backup_cover_expiring:    "maintenance",
  backup_cover_missing:     "maintenance",
  clause_1412_outstanding:  "maintenance",
  surveillance_remedial:    "dashboard",
  surveillance_overdue:     "dashboard",
};

export default function BAFEPage() {
  const [tab, setTab] = useState<TabKey>("dashboard");

  const handleAlertClick = useCallback((alert: BafeComplianceAlert) => {
    const target = ALERT_TO_TAB[alert.alert_kind];
    if (target) setTab(target);
  }, []);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">BAFE SP203-1</h1>
            <p className="text-sm text-muted-foreground">
              Compliance triage, Lead Individuals, certificates, maintenance
              contracts, and sub-contractor verification — all in one place.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="dashboard">Compliance</TabsTrigger>
            <TabsTrigger value="leads">Lead Individuals</TabsTrigger>
            <TabsTrigger value="certs">Certificates</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="subs">Sub-contractors</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4">
            <BAFEComplianceDashboard onAlertClick={handleAlertClick} />
          </TabsContent>
          <TabsContent value="leads" className="mt-4">
            <BAFELeadIndividualsPanel />
          </TabsContent>
          <TabsContent value="certs" className="mt-4">
            <BAFECertificateRegister />
          </TabsContent>
          <TabsContent value="maintenance" className="mt-4">
            <BAFEMaintenanceContractPanel />
          </TabsContent>
          <TabsContent value="subs" className="mt-4">
            <BAFESubcontractorRegister />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
