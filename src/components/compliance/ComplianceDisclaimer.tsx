import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { COMPLIANCE_DISCLAIMER } from "@/services/compliance/complianceService";

export const ComplianceDisclaimer = () => (
  <Alert className="border-warning/50 bg-warning/5">
    <AlertTriangle className="h-4 w-4 text-warning" />
    <AlertTitle>Compliance disclaimer (draft / example rule pack)</AlertTitle>
    <AlertDescription className="text-xs leading-relaxed">
      {COMPLIANCE_DISCLAIMER}
    </AlertDescription>
  </Alert>
);
