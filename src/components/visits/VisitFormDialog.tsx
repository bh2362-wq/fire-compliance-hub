import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const visitFormSchema = z.object({
  site_id: z.string().min(1, "Site is required"),
  visit_date: z.string().min(1, "Visit date is required"),
  visit_type: z.string().min(1, "Visit type is required"),
  notes: z.string().max(1000).optional(),
});

type VisitFormData = z.infer<typeof visitFormSchema>;

const VISIT_TYPES = [
  "Quarterly Service",
  "Annual Inspection",
  "Emergency Callout",
  "Installation",
  "Remedial Works",
  "Commissioning",
];

interface Site {
  id: string;
  name: string;
}

interface VisitFormDialogProps {
  siteId?: string;
  siteName?: string;
  sites?: Site[];
  onVisitCreated?: (visitId: string) => void;
  trigger?: React.ReactNode;
}

const VisitFormDialog = ({
  siteId,
  siteName,
  sites = [],
  onVisitCreated,
  trigger,
}: VisitFormDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<VisitFormData>({
    resolver: zodResolver(visitFormSchema),
    defaultValues: {
      site_id: siteId || "",
      visit_date: format(new Date(), "yyyy-MM-dd"),
      visit_type: "",
      notes: "",
    },
  });

  // Update site_id when siteId prop changes
  useEffect(() => {
    if (siteId) {
      form.setValue("site_id", siteId);
    }
  }, [siteId, form]);

  const showSiteSelector = !siteId && sites.length > 0;
  const selectedSiteId = form.watch("site_id");
  const selectedSiteName = sites.find(s => s.id === selectedSiteId)?.name || siteName;

  const onSubmit = async (data: VisitFormData) => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: visit, error } = await supabase
        .from("visits")
        .insert({
          site_id: data.site_id,
          visit_date: data.visit_date,
          visit_type: data.visit_type,
          notes: data.notes || null,
          engineer_id: user?.id || null,
          status: "in_progress",
        })
        .select("id")
        .single();

      if (error) throw error;

      toast({
        title: "Visit created",
        description: `New ${data.visit_type} visit created successfully.`,
      });

      form.reset({
        site_id: siteId || "",
        visit_date: format(new Date(), "yyyy-MM-dd"),
        visit_type: "",
        notes: "",
      });
      setOpen(false);
      onVisitCreated?.(visit.id);
    } catch (error) {
      console.error("Error creating visit:", error);
      toast({
        title: "Error",
        description: "Failed to create visit. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="hero" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New Visit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Create New Visit
          </DialogTitle>
          <DialogDescription>
            {selectedSiteName
              ? `Create a new service visit for ${selectedSiteName}`
              : "Select a site and create a new service visit"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {showSiteSelector && (
              <FormField
                control={form.control}
                name="site_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a site" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sites.map((site) => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="visit_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Visit Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="visit_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Visit Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select visit type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {VISIT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any notes about this visit..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" variant="hero" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Visit"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default VisitFormDialog;
