import { Routes, Route, Navigate } from "react-router-dom";
import { FieldLayout } from "./FieldLayout";
import { Today } from "./pages/Today";
import { SiteBriefing } from "./pages/SiteBriefing";
import { JobDashboard } from "./pages/JobDashboard";
import { DeviceTesting } from "./pages/DeviceTesting";
import { Signoff } from "./pages/Signoff";
import { JobComplete } from "./pages/JobComplete";
import { DefectCapture } from "./pages/DefectCapture";

export function FieldRoutes() {
  return (
    <FieldLayout>
      <Routes>
        <Route index element={<Today />} />
        <Route path="job/:visitId" element={<JobDashboard />} />
        <Route path="job/:visitId/briefing" element={<SiteBriefing />} />
        <Route path="job/:visitId/test" element={<DeviceTesting />} />
        <Route path="job/:visitId/defect" element={<DefectCapture />} />
        <Route path="job/:visitId/signoff" element={<Signoff />} />
        <Route path="job/:visitId/complete" element={<JobComplete />} />
        <Route path="*" element={<Navigate to="/field" replace />} />
      </Routes>
    </FieldLayout>
  );
}
