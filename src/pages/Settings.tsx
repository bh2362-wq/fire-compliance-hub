import { useState, useEffect } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { XeroConnectionCard } from "@/components/xero/XeroConnectionCard";
import { SharePointConnectionCard } from "@/components/sharepoint/SharePointConnectionCard";
import { OutstandingInvoices } from "@/components/xero/OutstandingInvoices";
import { useAuth } from "@/contexts/AuthContext";
import { getXeroConnection, XeroConnection } from "@/services/xeroService";
import { getCompanySettings, upsertCompanySettings, CompanySettings } from "@/services/companySettingsService";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyProfileTab } from "@/components/settings/CompanyProfileTab";
import { ReportBrandingTab } from "@/components/settings/ReportBrandingTab";
import { TeamManagementTab } from "@/components/settings/TeamManagementTab";
import { DefaultSettingsTab } from "@/components/settings/DefaultSettingsTab";
 import { EmailTemplatesTab } from "@/components/settings/EmailTemplatesTab";
 import { SecurityComplianceTab } from "@/components/settings/SecurityComplianceTab";
 import { Building2, FileText, Users, Settings2, Link, Mail, Shield } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

const Settings = () => {
  const { user } = useAuth();
  const [xeroConnection, setXeroConnection] = useState<XeroConnection | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        const [xeroConn, company] = await Promise.all([
          getXeroConnection(user.id).catch(() => null),
          getCompanySettings().catch(() => null),
        ]);
        setXeroConnection(xeroConn);
        setCompanySettings(company);
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    };
    
    loadSettings();
  }, [user]);

  const handleSaveCompanySettings = async (data: Partial<CompanySettings>) => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const updated = await upsertCompanySettings(data, user.id);
      setCompanySettings(updated);
      toast.success("Settings saved successfully");
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <Skeleton className="h-[400px] w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Settings</h2>
          <p className="text-muted-foreground">Configure your company, branding, team, and integrations</p>
        </div>

        <Tabs defaultValue="company" className="space-y-6">
           <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="company" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Company</span>
            </TabsTrigger>
            <TabsTrigger value="branding" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Branding</span>
            </TabsTrigger>
             <TabsTrigger value="emails" className="flex items-center gap-2">
               <Mail className="h-4 w-4" />
               <span className="hidden sm:inline">Emails</span>
             </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Team</span>
            </TabsTrigger>
            <TabsTrigger value="defaults" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Defaults</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              <span className="hidden sm:inline">Integrations</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="company">
            <CompanyProfileTab
              settings={companySettings}
              onSave={handleSaveCompanySettings}
              isSaving={isSaving}
            />
          </TabsContent>

          <TabsContent value="branding">
            <ReportBrandingTab
              settings={companySettings}
              onSave={handleSaveCompanySettings}
              isSaving={isSaving}
            />
          </TabsContent>

           <TabsContent value="emails">
             <EmailTemplatesTab />
           </TabsContent>
 
          <TabsContent value="team">
            <TeamManagementTab />
          </TabsContent>

          <TabsContent value="defaults">
            <DefaultSettingsTab
              settings={companySettings}
              onSave={handleSaveCompanySettings}
              isSaving={isSaving}
            />
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <XeroConnectionCard />
              <SharePointConnectionCard />
            </div>
            {xeroConnection && <OutstandingInvoices />}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
