 import { useState } from "react";
 import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
 import { toast } from "sonner";
 import { Loader2, Mail, MessageSquare, Phone, CheckCircle, XCircle } from "lucide-react";
 import { sendSmsReminder, sendVoiceReminder, sendChaseEmail } from "@/services/creditControlService";
 
 interface CreditControlTestDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
 }
 
 export function CreditControlTestDialog({ open, onOpenChange }: CreditControlTestDialogProps) {
   const [loading, setLoading] = useState(false);
   const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
 
   // Email test state
   const [emailTo, setEmailTo] = useState("");
 
   // SMS test state
   const [smsTo, setSmsTo] = useState("");
 
   // Voice test state
   const [voiceTo, setVoiceTo] = useState("");
 
   const handleTestEmail = async () => {
     if (!emailTo) {
       toast.error("Please enter an email address");
       return;
     }
 
     setLoading(true);
     setTestResult(null);
     try {
       const result = await sendChaseEmail({
         to: emailTo,
         subject: "Test Payment Reminder - BHO Fire",
         message: `This is a test payment reminder email from BHO Fire's credit control system.\n\nIf you receive this email, the email channel is working correctly.`,
         invoice_number: "TEST-001",
         amount_due: 250.00,
         days_overdue: 7,
       });
 
       if (result.success) {
         setTestResult({ success: true, message: `Email sent successfully! ID: ${result.email_id}` });
         toast.success("Test email sent successfully");
       } else {
         setTestResult({ success: false, message: result.error || "Failed to send email" });
         toast.error(result.error || "Failed to send test email");
       }
     } catch (error: any) {
       console.error("Email test failed:", error);
       setTestResult({ success: false, message: error.message });
       toast.error(error.message || "Failed to send test email");
     } finally {
       setLoading(false);
     }
   };
 
   const handleTestSms = async () => {
     if (!smsTo) {
       toast.error("Please enter a phone number");
       return;
     }
 
     setLoading(true);
     setTestResult(null);
     try {
       const result = await sendSmsReminder({
         to: smsTo,
         message: "TEST: This is a test payment reminder from BHO Fire. Invoice TEST-001 for £250.00 is overdue. Please make payment at your earliest convenience.",
         invoice_number: "TEST-001",
         amount_due: 250.00,
       });
 
       if (result.success) {
         setTestResult({ success: true, message: `SMS sent successfully! SID: ${result.message_sid}` });
         toast.success("Test SMS sent successfully");
       } else {
         setTestResult({ success: false, message: result.error || "Failed to send SMS" });
         toast.error(result.error || "Failed to send test SMS");
       }
     } catch (error: any) {
       console.error("SMS test failed:", error);
       setTestResult({ success: false, message: error.message });
       toast.error(error.message || "Failed to send test SMS");
     } finally {
       setLoading(false);
     }
   };
 
   const handleTestVoice = async () => {
     if (!voiceTo) {
       toast.error("Please enter a phone number");
       return;
     }
 
     setLoading(true);
     setTestResult(null);
     try {
       const result = await sendVoiceReminder({
         to: voiceTo,
         message: "Hello, this is a test call from BHO Fire regarding a payment reminder. This is a test of the automated voice system. If you can hear this message, the voice channel is working correctly.",
         invoice_number: "TEST-001",
         amount_due: 250.00,
         company_name: "BHO Fire",
       });
 
       if (result.success) {
         setTestResult({ success: true, message: `Call initiated! SID: ${result.call_sid}` });
         toast.success("Test call initiated successfully");
       } else {
         setTestResult({ success: false, message: result.error || "Failed to initiate call" });
         toast.error(result.error || "Failed to initiate test call");
       }
     } catch (error: any) {
       console.error("Voice test failed:", error);
       setTestResult({ success: false, message: error.message });
       toast.error(error.message || "Failed to initiate test call");
     } finally {
       setLoading(false);
     }
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="sm:max-w-md">
         <DialogHeader>
           <DialogTitle>Test Communication Channels</DialogTitle>
           <DialogDescription>
             Send test messages to verify your Twilio and email configuration
           </DialogDescription>
         </DialogHeader>
 
         <Tabs defaultValue="email" className="mt-4">
           <TabsList className="grid grid-cols-3">
             <TabsTrigger value="email">
               <Mail className="mr-2 h-4 w-4" />
               Email
             </TabsTrigger>
             <TabsTrigger value="sms">
               <MessageSquare className="mr-2 h-4 w-4" />
               SMS
             </TabsTrigger>
             <TabsTrigger value="voice">
               <Phone className="mr-2 h-4 w-4" />
               Voice
             </TabsTrigger>
           </TabsList>
 
           <TabsContent value="email" className="space-y-4 mt-4">
             <div className="space-y-2">
               <Label htmlFor="email-to">Email Address</Label>
               <Input
                 id="email-to"
                 type="email"
                 placeholder="test@example.com"
                 value={emailTo}
                 onChange={(e) => setEmailTo(e.target.value)}
               />
             </div>
             <Button onClick={handleTestEmail} disabled={loading} className="w-full">
               {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
               Send Test Email
             </Button>
           </TabsContent>
 
           <TabsContent value="sms" className="space-y-4 mt-4">
             <div className="space-y-2">
               <Label htmlFor="sms-to">Phone Number</Label>
               <Input
                 id="sms-to"
                 type="tel"
                 placeholder="+44 7700 900000"
                 value={smsTo}
                 onChange={(e) => setSmsTo(e.target.value)}
               />
               <p className="text-xs text-muted-foreground">
                 Include country code (e.g., +44 for UK)
               </p>
             </div>
             <Button onClick={handleTestSms} disabled={loading} className="w-full">
               {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
               Send Test SMS
             </Button>
           </TabsContent>
 
           <TabsContent value="voice" className="space-y-4 mt-4">
             <div className="space-y-2">
               <Label htmlFor="voice-to">Phone Number</Label>
               <Input
                 id="voice-to"
                 type="tel"
                 placeholder="+44 7700 900000"
                 value={voiceTo}
                 onChange={(e) => setVoiceTo(e.target.value)}
               />
               <p className="text-xs text-muted-foreground">
                 Include country code (e.g., +44 for UK). You will receive a test call.
               </p>
             </div>
             <Button onClick={handleTestVoice} disabled={loading} className="w-full">
               {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
               Make Test Call
             </Button>
           </TabsContent>
         </Tabs>
 
         {testResult && (
           <div
             className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
               testResult.success
                 ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                 : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400"
             }`}
           >
             {testResult.success ? (
               <CheckCircle className="h-5 w-5 flex-shrink-0" />
             ) : (
               <XCircle className="h-5 w-5 flex-shrink-0" />
             )}
             <span className="text-sm">{testResult.message}</span>
           </div>
         )}
       </DialogContent>
     </Dialog>
   );
 }