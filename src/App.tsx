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
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Visits from "./pages/Visits";
import Invoices from "./pages/Invoices";
import Reports from "./pages/Reports";
import UploadDemo from "./pages/UploadDemo";
import Reconciliation from "./pages/Reconciliation";
import Settings from "./pages/Settings";
import Schedule from "./pages/Schedule";
import NotFound from "./pages/NotFound";
import EmailLogs from "./pages/EmailLogs";
import CreditControl from "./pages/CreditControl";
import Quotations from "./pages/Quotations";
import PurchaseOrders from "./pages/PurchaseOrders";
import SharedReport from "./pages/SharedReport";
import AcceptQuote from "./pages/AcceptQuote";
import AcceptVisit from "./pages/AcceptVisit";
import EmailScanner from "./pages/EmailScanner";
import DevicePricing from "./pages/DevicePricing";
import ProductLookup from "./pages/ProductLookup";
import CustomerForms from "./pages/CustomerForms";

// QMS Pages
import QMSDashboard from "./pages/qms/QMSDashboard";
import Documents from "./pages/qms/Documents";
import NCRs from "./pages/qms/NCRs";
import CAPAs from "./pages/qms/CAPAs";
import Risks from "./pages/qms/Risks";
import Training from "./pages/qms/Training";
import Audits from "./pages/qms/Audits";
import Feedback from "./pages/qms/Feedback";
import ManagementReview from "./pages/qms/ManagementReview";
import RAMS from "./pages/qms/RAMS";

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
            <Route path="/shared-report/:token" element={<SharedReport />} />
            <Route path="/accept-quote/:token" element={<AcceptQuote />} />
            <Route path="/accept-visit/:token" element={<AcceptVisit />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard/schedule" element={<ProtectedRoute><Schedule /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
            <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
            <Route path="/sites" element={<ProtectedRoute><Sites /></ProtectedRoute>} />
            <Route path="/sites/:siteId" element={<ProtectedRoute><SiteDetail /></ProtectedRoute>} />
            <Route path="/dashboard/sites" element={<ProtectedRoute><Sites /></ProtectedRoute>} />
            <Route path="/dashboard/sites/:siteId" element={<ProtectedRoute><SiteDetail /></ProtectedRoute>} />
            <Route path="/dashboard/visits" element={<ProtectedRoute><Visits /></ProtectedRoute>} />
            <Route path="/dashboard/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
            <Route path="/dashboard/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/dashboard/upload" element={<ProtectedRoute><UploadDemo /></ProtectedRoute>} />
            <Route path="/dashboard/reconciliation" element={<ProtectedRoute><Reconciliation /></ProtectedRoute>} />
            <Route path="/dashboard/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/dashboard/email-logs" element={<ProtectedRoute><EmailLogs /></ProtectedRoute>} />
            <Route path="/dashboard/credit-control" element={<ProtectedRoute><CreditControl /></ProtectedRoute>} />
            <Route path="/dashboard/quotations" element={<ProtectedRoute><Quotations /></ProtectedRoute>} />
            <Route path="/dashboard/purchase-orders" element={<ProtectedRoute><PurchaseOrders /></ProtectedRoute>} />
            <Route path="/dashboard/email-scanner" element={<ProtectedRoute><EmailScanner /></ProtectedRoute>} />
            <Route path="/dashboard/device-pricing" element={<ProtectedRoute><DevicePricing /></ProtectedRoute>} />
            <Route path="/dashboard/product-lookup" element={<ProtectedRoute><ProductLookup /></ProtectedRoute>} />
            
            {/* QMS Routes */}
            <Route path="/qms" element={<ProtectedRoute><QMSDashboard /></ProtectedRoute>} />
            <Route path="/qms/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
            <Route path="/qms/ncrs" element={<ProtectedRoute><NCRs /></ProtectedRoute>} />
            <Route path="/qms/capas" element={<ProtectedRoute><CAPAs /></ProtectedRoute>} />
            <Route path="/qms/risks" element={<ProtectedRoute><Risks /></ProtectedRoute>} />
            <Route path="/qms/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
            <Route path="/qms/audits" element={<ProtectedRoute><Audits /></ProtectedRoute>} />
            <Route path="/qms/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
            <Route path="/qms/management-review" element={<ProtectedRoute><ManagementReview /></ProtectedRoute>} />
            <Route path="/qms/rams" element={<ProtectedRoute><RAMS /></ProtectedRoute>} />
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
