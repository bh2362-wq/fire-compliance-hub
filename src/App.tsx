import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Sites from "./pages/Sites";
import SiteDetail from "./pages/SiteDetail";
import Visits from "./pages/Visits";
import Reports from "./pages/Reports";
import UploadDemo from "./pages/UploadDemo";
import Reconciliation from "./pages/Reconciliation";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard/sites" element={<ProtectedRoute><Sites /></ProtectedRoute>} />
            <Route path="/dashboard/sites/:siteId" element={<ProtectedRoute><SiteDetail /></ProtectedRoute>} />
            <Route path="/dashboard/visits" element={<ProtectedRoute><Visits /></ProtectedRoute>} />
            <Route path="/dashboard/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/dashboard/upload" element={<ProtectedRoute><UploadDemo /></ProtectedRoute>} />
            <Route path="/dashboard/reconciliation" element={<ProtectedRoute><Reconciliation /></ProtectedRoute>} />
            <Route path="/dashboard/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
