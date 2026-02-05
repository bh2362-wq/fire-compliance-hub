 import { useState, useEffect } from "react";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Textarea } from "@/components/ui/textarea";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
 import { Badge } from "@/components/ui/badge";
 import { Separator } from "@/components/ui/separator";
 import { toast } from "sonner";
 import { Mail, MessageSquare, Phone, Save, Plus, Trash2, Play, Volume2 } from "lucide-react";
 import { supabase } from "@/integrations/supabase/client";
 
 // ElevenLabs voice options
 const ELEVENLABS_VOICES = [
   { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", description: "British, professional" },
   { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", description: "American, warm" },
   { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", description: "American, friendly" },
   { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", description: "Australian, conversational" },
   { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", description: "British, authoritative" },
   { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", description: "American, energetic" },
   { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", description: "British, elegant" },
   { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", description: "American, warm" },
   { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", description: "American, expressive" },
   { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", description: "British, deep" },
   { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", description: "British, soft" },
 ];
 
 // Preset templates
 const PRESET_TEMPLATES = {
   email: [
     {
       name: "Friendly Reminder (7 days)",
       subject: "Friendly Reminder: Invoice {{invoice_number}} - Payment Due",
       message: `Dear {{contact_name}},
 
 I hope this email finds you well. This is a friendly reminder that invoice {{invoice_number}} for £{{amount_due}} was due on {{due_date}}.
 
 If you have already made this payment, please disregard this message. Otherwise, we would appreciate it if you could arrange payment at your earliest convenience.
 
 If you have any questions regarding this invoice, please don't hesitate to contact us.
 
 Kind regards,
 {{company_name}}`,
     },
     {
       name: "Follow-up (14 days)",
       subject: "Payment Follow-up: Invoice {{invoice_number}} - Now {{days_overdue}} Days Overdue",
       message: `Dear {{contact_name}},
 
 We notice that invoice {{invoice_number}} for £{{amount_due}} is now {{days_overdue}} days overdue.
 
 We understand that oversights can happen, so please treat this as a gentle reminder to process this payment.
 
 If there are any issues with the invoice or you need to discuss payment arrangements, please contact us as soon as possible.
 
 Best regards,
 {{company_name}}`,
     },
     {
       name: "Urgent Notice (21 days)",
       subject: "Urgent: Invoice {{invoice_number}} - Immediate Payment Required",
       message: `Dear {{contact_name}},
 
 Despite our previous reminders, invoice {{invoice_number}} for £{{amount_due}} remains unpaid and is now {{days_overdue}} days overdue.
 
 Please arrange immediate payment to avoid any disruption to your account status.
 
 If you are experiencing difficulties, please contact us urgently to discuss your options.
 
 Regards,
 {{company_name}}`,
     },
     {
       name: "Final Notice (30 days)",
       subject: "Final Notice: Invoice {{invoice_number}} - Action Required Within 7 Days",
       message: `Dear {{contact_name}},
 
 FINAL NOTICE
 
 Invoice {{invoice_number}} for £{{amount_due}} is now {{days_overdue}} days overdue.
 
 This is our final reminder before we escalate this matter. Please arrange full payment within 7 days of this notice.
 
 Failure to respond may result in account suspension and further action.
 
 Please contact us immediately if you wish to discuss this matter.
 
 {{company_name}}`,
     },
   ],
   sms: [
     {
       name: "Friendly Reminder",
       message: "Hi {{contact_name}}, just a reminder that invoice {{invoice_number}} for £{{amount_due}} is due. Please arrange payment or contact us. Thanks!",
     },
     {
       name: "Follow-up",
       message: "Invoice {{invoice_number}} for £{{amount_due}} is now {{days_overdue}} days overdue. Please arrange payment urgently. Call us if you need to discuss.",
     },
     {
       name: "Urgent Notice",
       message: "URGENT: Invoice {{invoice_number}} (£{{amount_due}}) is {{days_overdue}} days overdue. Immediate payment required to avoid account action.",
     },
     {
       name: "Final Notice",
       message: "FINAL NOTICE: Invoice {{invoice_number}} (£{{amount_due}}) must be paid within 7 days to avoid escalation. Contact us immediately.",
     },
   ],
   voice: [
     {
       name: "Friendly Reminder",
       message: "Hello, this is a courtesy call regarding invoice {{invoice_number}} for {{amount_due}} pounds, which is now overdue. Please arrange payment at your earliest convenience, or call us if you have any questions. Thank you.",
     },
     {
       name: "Follow-up Call",
       message: "Hello, this is a follow-up call about invoice {{invoice_number}} for {{amount_due}} pounds, which is now {{days_overdue}} days overdue. Please make payment urgently or contact us to discuss payment options. Thank you.",
     },
     {
       name: "Urgent Notice",
       message: "Hello, this is an urgent call regarding invoice {{invoice_number}} for {{amount_due}} pounds, which is significantly overdue. Please arrange immediate payment to avoid any impact to your account. Contact us as soon as possible.",
     },
     {
       name: "Final Notice",
       message: "Hello, this is a final notice regarding invoice {{invoice_number}} for {{amount_due}} pounds. This invoice is now {{days_overdue}} days overdue and requires immediate payment. Please contact us within 7 days to avoid further action.",
     },
   ],
 };
 
 interface ReminderTemplate {
   id?: string;
   name: string;
   channel: "email" | "sms" | "voice";
   subject?: string;
   message: string;
   voice_id?: string;
   days_overdue?: number;
   is_preset?: boolean;
 }
 
 export function ReminderTemplatesTab() {
   const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
   const [selectedVoice, setSelectedVoice] = useState(ELEVENLABS_VOICES[0].id);
   const [testingVoice, setTestingVoice] = useState(false);
   const [activeChannel, setActiveChannel] = useState<"email" | "sms" | "voice">("email");
   
   // Current editing template
   const [editingTemplate, setEditingTemplate] = useState<ReminderTemplate | null>(null);
 
   // Load saved templates from localStorage (or could be from DB)
   useEffect(() => {
     const saved = localStorage.getItem("credit_control_templates");
     if (saved) {
       setTemplates(JSON.parse(saved));
     }
   }, []);
 
   const saveTemplates = (newTemplates: ReminderTemplate[]) => {
     setTemplates(newTemplates);
     localStorage.setItem("credit_control_templates", JSON.stringify(newTemplates));
     toast.success("Templates saved");
   };
 
   const handleSaveTemplate = () => {
     if (!editingTemplate?.name || !editingTemplate?.message) {
       toast.error("Please fill in template name and message");
       return;
     }
 
     const template = {
       ...editingTemplate,
       id: editingTemplate.id || crypto.randomUUID(),
       channel: activeChannel,
       voice_id: activeChannel === "voice" ? selectedVoice : undefined,
     };
 
     const existing = templates.findIndex((t) => t.id === template.id);
     let newTemplates: ReminderTemplate[];
     
     if (existing >= 0) {
       newTemplates = [...templates];
       newTemplates[existing] = template;
     } else {
       newTemplates = [...templates, template];
     }
 
     saveTemplates(newTemplates);
     setEditingTemplate(null);
   };
 
   const handleDeleteTemplate = (id: string) => {
     const newTemplates = templates.filter((t) => t.id !== id);
     saveTemplates(newTemplates);
   };
 
   const handleLoadPreset = (preset: typeof PRESET_TEMPLATES.email[0] | typeof PRESET_TEMPLATES.sms[0] | typeof PRESET_TEMPLATES.voice[0]) => {
     setEditingTemplate({
       name: preset.name,
       channel: activeChannel,
       subject: "subject" in preset ? preset.subject : undefined,
       message: preset.message,
       voice_id: activeChannel === "voice" ? selectedVoice : undefined,
     });
   };
 
   const handleTestVoice = async () => {
     if (!selectedVoice) return;
     
     setTestingVoice(true);
     try {
       const testMessage = "Hello, this is a test of the voice reminder system. Invoice number 12345 for 500 pounds is now overdue.";
       
       const { data, error } = await supabase.functions.invoke("elevenlabs-tts", {
         body: { text: testMessage, voiceId: selectedVoice },
       });
 
       if (error) throw error;
 
       // Play the audio
       if (data?.audioContent) {
         const audioUrl = `data:audio/mpeg;base64,${data.audioContent}`;
         const audio = new Audio(audioUrl);
         await audio.play();
       } else {
         toast.info("Voice preview generated - check console for details");
       }
     } catch (error: any) {
       console.error("Voice test error:", error);
       toast.error("Voice test failed - ElevenLabs edge function may need setup");
     } finally {
       setTestingVoice(false);
     }
   };
 
   const getChannelIcon = (channel: string) => {
     switch (channel) {
       case "email": return <Mail className="h-4 w-4" />;
       case "sms": return <MessageSquare className="h-4 w-4" />;
       case "voice": return <Phone className="h-4 w-4" />;
       default: return null;
     }
   };
 
   const filteredTemplates = templates.filter((t) => t.channel === activeChannel);
   const presets = activeChannel === "email" 
     ? PRESET_TEMPLATES.email 
     : activeChannel === "sms" 
       ? PRESET_TEMPLATES.sms 
       : PRESET_TEMPLATES.voice;
 
   return (
     <div className="space-y-6">
       <Card>
         <CardHeader>
           <CardTitle>Reminder Templates</CardTitle>
           <CardDescription>
             Configure message templates for automated reminders. Use placeholders like {"{{invoice_number}}"}, {"{{amount_due}}"}, {"{{days_overdue}}"}, {"{{contact_name}}"}, {"{{due_date}}"}, {"{{company_name}}"}.
           </CardDescription>
         </CardHeader>
         <CardContent>
           <Tabs value={activeChannel} onValueChange={(v) => setActiveChannel(v as any)}>
             <TabsList className="grid w-full grid-cols-3">
               <TabsTrigger value="email" className="flex items-center gap-2">
                 <Mail className="h-4 w-4" />
                 Email
               </TabsTrigger>
               <TabsTrigger value="sms" className="flex items-center gap-2">
                 <MessageSquare className="h-4 w-4" />
                 SMS
               </TabsTrigger>
               <TabsTrigger value="voice" className="flex items-center gap-2">
                 <Phone className="h-4 w-4" />
                 Voice
               </TabsTrigger>
             </TabsList>
 
             {/* Voice Settings (only for voice tab) */}
             {activeChannel === "voice" && (
               <Card className="mt-4 bg-muted/50">
                 <CardHeader className="pb-3">
                   <CardTitle className="text-base flex items-center gap-2">
                     <Volume2 className="h-4 w-4" />
                     Voice Settings (ElevenLabs)
                   </CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4">
                   <div className="grid gap-4 md:grid-cols-2">
                     <div className="space-y-2">
                       <Label>Select Voice</Label>
                       <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                         <SelectTrigger>
                           <SelectValue placeholder="Select a voice" />
                         </SelectTrigger>
                         <SelectContent>
                           {ELEVENLABS_VOICES.map((voice) => (
                             <SelectItem key={voice.id} value={voice.id}>
                               <div className="flex items-center gap-2">
                                 <span className="font-medium">{voice.name}</span>
                                 <span className="text-muted-foreground text-xs">({voice.description})</span>
                               </div>
                             </SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                     </div>
                     <div className="flex items-end">
                       <Button 
                         variant="outline" 
                         onClick={handleTestVoice}
                         disabled={testingVoice}
                       >
                         <Play className="mr-2 h-4 w-4" />
                         {testingVoice ? "Playing..." : "Test Voice"}
                       </Button>
                     </div>
                   </div>
                 </CardContent>
               </Card>
             )}
 
             {/* Preset Templates */}
             <div className="mt-4">
               <Label className="text-sm font-medium">Quick Start - Load Preset</Label>
               <div className="flex flex-wrap gap-2 mt-2">
                 {presets.map((preset, idx) => (
                   <Button
                     key={idx}
                     variant="outline"
                     size="sm"
                     onClick={() => handleLoadPreset(preset)}
                   >
                     <Plus className="mr-1 h-3 w-3" />
                     {preset.name}
                   </Button>
                 ))}
               </div>
             </div>
 
             <Separator className="my-4" />
 
             {/* Template Editor */}
             <div className="space-y-4">
               <div className="flex items-center justify-between">
                 <Label className="text-sm font-medium">
                   {editingTemplate ? "Edit Template" : "Create New Template"}
                 </Label>
                 {editingTemplate && (
                   <Button variant="ghost" size="sm" onClick={() => setEditingTemplate(null)}>
                     Cancel
                   </Button>
                 )}
               </div>
 
               <div className="space-y-4">
                 <div className="space-y-2">
                   <Label htmlFor="template-name">Template Name</Label>
                   <Input
                     id="template-name"
                     placeholder="e.g., Friendly Reminder (7 days)"
                     value={editingTemplate?.name || ""}
                     onChange={(e) => setEditingTemplate({ 
                       ...editingTemplate, 
                       name: e.target.value,
                       channel: activeChannel,
                       message: editingTemplate?.message || "",
                     })}
                   />
                 </div>
 
                 {activeChannel === "email" && (
                   <div className="space-y-2">
                     <Label htmlFor="template-subject">Subject Line</Label>
                     <Input
                       id="template-subject"
                       placeholder="e.g., Payment Reminder: Invoice {{invoice_number}}"
                       value={editingTemplate?.subject || ""}
                       onChange={(e) => setEditingTemplate({ 
                         ...editingTemplate!,
                         subject: e.target.value,
                       })}
                     />
                   </div>
                 )}
 
                 <div className="space-y-2">
                   <Label htmlFor="template-message">
                     Message {activeChannel === "sms" && `(${editingTemplate?.message?.length || 0}/160)`}
                   </Label>
                   <Textarea
                     id="template-message"
                     rows={activeChannel === "email" ? 10 : 4}
                     placeholder="Enter your message template..."
                     value={editingTemplate?.message || ""}
                     onChange={(e) => setEditingTemplate({ 
                       ...editingTemplate!,
                       message: e.target.value,
                     })}
                     maxLength={activeChannel === "sms" ? 160 : undefined}
                   />
                 </div>
 
                 <Button onClick={handleSaveTemplate} disabled={!editingTemplate?.name || !editingTemplate?.message}>
                   <Save className="mr-2 h-4 w-4" />
                   Save Template
                 </Button>
               </div>
             </div>
 
             <Separator className="my-4" />
 
             {/* Saved Templates List */}
             <div className="space-y-4">
               <Label className="text-sm font-medium">Saved Templates</Label>
               {filteredTemplates.length === 0 ? (
                 <div className="text-center py-6 text-muted-foreground border rounded-lg">
                   No {activeChannel} templates saved yet. Load a preset or create one above.
                 </div>
               ) : (
                 <div className="space-y-2">
                   {filteredTemplates.map((template) => (
                     <div
                       key={template.id}
                       className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                       onClick={() => setEditingTemplate(template)}
                     >
                       <div className="flex items-center gap-3">
                         {getChannelIcon(template.channel)}
                         <div>
                           <p className="font-medium">{template.name}</p>
                           <p className="text-xs text-muted-foreground truncate max-w-md">
                             {template.subject || template.message.substring(0, 60)}...
                           </p>
                         </div>
                       </div>
                       <div className="flex items-center gap-2">
                         {template.voice_id && (
                           <Badge variant="outline">
                             {ELEVENLABS_VOICES.find(v => v.id === template.voice_id)?.name || "Custom"}
                           </Badge>
                         )}
                         <Button
                           variant="ghost"
                           size="icon"
                           onClick={(e) => {
                             e.stopPropagation();
                             handleDeleteTemplate(template.id!);
                           }}
                         >
                           <Trash2 className="h-4 w-4 text-destructive" />
                         </Button>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>
           </Tabs>
         </CardContent>
       </Card>
     </div>
   );
 }