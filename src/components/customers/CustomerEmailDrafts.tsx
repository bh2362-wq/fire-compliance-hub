import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Send, Trash2, Mail, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Draft {
  id: string;
  customer_id: string | null;
  site_id: string | null;
  visit_id: string | null;
  form_label: string | null;
  recipient_email: string | null;
  subject: string | null;
  body: string;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface Props {
  customerId: string;
  defaultRecipient?: string;
}

export function CustomerEmailDrafts({ customerId, defaultRecipient }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("customer_email_drafts")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setDrafts(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [customerId]);

  async function remove(id: string) {
    if (!confirm("Delete this draft?")) return;
    const { error } = await supabase.from("customer_email_drafts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Draft deleted");
      load();
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    const { error } = await supabase
      .from("customer_email_drafts")
      .update({
        subject: editing.subject,
        body: editing.body,
        recipient_email: editing.recipient_email,
      })
      .eq("id", editing.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Draft updated");
      setEditing(null);
      load();
    }
  }

  async function send(d: Draft) {
    const to = d.recipient_email || defaultRecipient;
    if (!to) {
      toast.error("Add a recipient first");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-customer-email", {
        body: {
          to,
          subject: d.subject || "Service summary",
          body: d.body,
          customerId: d.customer_id,
          siteId: d.site_id,
          visitId: d.visit_id,
          draftId: d.id,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Email sent");
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" /> Email Drafts
          <Badge variant="secondary" className="text-xs ml-1">
            {drafts.filter((d) => d.status === "draft").length} pending
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : drafts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No saved drafts yet. Generate a client summary on a Smart Form and click Save draft.
          </p>
        ) : (
          <div className="space-y-2">
            {drafts.map((d) => (
              <div
                key={d.id}
                className="border rounded p-2 flex items-start gap-2 text-xs hover:bg-muted/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{d.subject || "(no subject)"}</span>
                    <Badge
                      variant={d.status === "sent" ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {d.status}
                    </Badge>
                    {d.form_label && (
                      <span className="text-muted-foreground truncate">· {d.form_label}</span>
                    )}
                  </div>
                  <p className="text-muted-foreground truncate mt-0.5">
                    To: {d.recipient_email || "—"} · {format(new Date(d.created_at), "dd MMM yyyy HH:mm")}
                    {d.sent_at && ` · sent ${format(new Date(d.sent_at), "dd MMM HH:mm")}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(d)} className="h-7 px-2">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  {d.status === "draft" && (
                    <Button size="sm" variant="ghost" onClick={() => send(d)} disabled={busy} className="h-7 px-2">
                      <Send className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(d.id)} className="h-7 px-2 text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit draft</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-2">
              <Input
                value={editing.recipient_email || ""}
                onChange={(e) => setEditing({ ...editing, recipient_email: e.target.value })}
                placeholder="Recipient email"
              />
              <Input
                value={editing.subject || ""}
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                placeholder="Subject"
              />
              <Textarea
                rows={14}
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="outline" onClick={saveEdit} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              Save
            </Button>
            {editing?.status === "draft" && (
              <Button onClick={() => editing && send(editing)} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                Send now
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
