import { useState } from "react";
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

interface VisitFormDialogProps {
  siteId: string;
  siteName?: string;
  onVisitCreated?: (visitId: string) => void;
  trigger?: React.ReactNode;
}

const VisitFormDialog = ({
  siteId,
  siteName,
  onVisitCreated,
  trigger,
}: VisitFormDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<VisitFormData>({
    resolver: zodResolver(visitFormSchema),
    defaultValues: {
      visit_date: format(new Date(), "yyyy-MM-dd"),
      visit_type: "",
      notes: "",
    },
  });

  const onSubmit = async (data: VisitFormData) => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: visit, error } = await supabase
        .from("visits")
        .insert({
          site_id: siteId,
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

      form.reset();
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
            {siteName
              ? `Create a new service visit for ${siteName}`
              : "Create a new service visit for this site"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
