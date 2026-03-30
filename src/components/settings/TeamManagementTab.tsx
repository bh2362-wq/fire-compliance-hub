import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Users, Loader2, Shield, UserCog, Wrench, Eye, User, Mail, Check, X, Calendar, Plus } from "lucide-react";
import { getTeamMembers, updateUserRole, updateMicrosoftEmail, addEngineerProfile } from "@/services/companySettingsService";
import { toast } from "sonner";

interface TeamMember {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  microsoft_email?: string | null;
  user_roles: { role: string }[] | null;
}

const roleConfig = {
  owner: { label: "Owner", color: "bg-purple-500", icon: Shield },
  admin: { label: "Admin", color: "bg-blue-500", icon: UserCog },
  engineer: { label: "Engineer", color: "bg-green-500", icon: Wrench },
  client: { label: "Client", color: "bg-orange-500", icon: User },
  auditor: { label: "Auditor", color: "bg-gray-500", icon: Eye },
};

export function TeamManagementTab() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: "", email: "", microsoft_email: "", role: "engineer" as const });
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadTeamMembers();
  }, []);

  const loadTeamMembers = async () => {
    try {
      const data = await getTeamMembers();
      setMembers(data as TeamMember[]);
    } catch (error) {
      console.error("Failed to load team members:", error);
      toast.error("Failed to load team members");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingId(userId);
    try {
      await updateUserRole(userId, newRole as 'owner' | 'admin' | 'engineer' | 'client' | 'auditor');
      await loadTeamMembers();
      toast.success("Role updated successfully");
    } catch (error) {
      console.error("Failed to update role:", error);
      toast.error("Failed to update role");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveMicrosoftEmail = async (userId: string) => {
    try {
      await updateMicrosoftEmail(userId, emailDraft.trim() || null);
      await loadTeamMembers();
      setEditingEmailId(null);
      toast.success("Microsoft email updated");
    } catch (error) {
      console.error("Failed to update Microsoft email:", error);
      toast.error("Failed to update Microsoft email");
    }
  };

  const handleAddEngineer = async () => {
    if (!addForm.full_name.trim() || !addForm.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setIsAdding(true);
    try {
      await addEngineerProfile({
        full_name: addForm.full_name.trim(),
        email: addForm.email.trim(),
        microsoft_email: addForm.microsoft_email.trim() || undefined,
        role: addForm.role,
      });
      await loadTeamMembers();
      setShowAddDialog(false);
      setAddForm({ full_name: "", email: "", microsoft_email: "", role: "engineer" });
      toast.success("Team member added successfully");
    } catch (error) {
      console.error("Failed to add team member:", error);
      toast.error("Failed to add team member");
    } finally {
      setIsAdding(false);
    }
  };

  const getUserRole = (member: TeamMember): string => {
    if (member.user_roles && member.user_roles.length > 0) {
      return member.user_roles[0].role;
    }
    return "engineer";
  };

  const getInitials = (name: string | null, email: string | null): string => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || "U";
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Management
            </CardTitle>
            <CardDescription>
              Manage team members, roles, and Outlook calendar sync
            </CardDescription>
          </div>
          <Button onClick={() => setShowAddDialog(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Team Member
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(roleConfig).map(([key, config]) => {
            const Icon = config.icon;
            return (
              <div key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className={`w-3 h-3 rounded-full ${config.color}`} />
                <Icon className="h-4 w-4" />
                <span>{config.label}</span>
              </div>
            );
          })}
        </div>

        {members.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No team members found</p>
            <p className="text-sm">Users will appear here once they sign up</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Microsoft / Outlook Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const currentRole = getUserRole(member);
                const isEditingEmail = editingEmailId === member.user_id;
                
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {getInitials(member.full_name, member.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {member.full_name || "Unnamed User"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.email || "No email"}
                    </TableCell>
                    <TableCell>
                      {isEditingEmail ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={emailDraft}
                            onChange={(e) => setEmailDraft(e.target.value)}
                            placeholder="user@company.com"
                            className="h-8 w-[200px] text-sm"
                            type="email"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleSaveMicrosoftEmail(member.user_id)}
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setEditingEmailId(null)}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {member.microsoft_email ? (
                            <>
                              <Calendar className="h-3.5 w-3.5 text-blue-500" />
                              <span className="text-sm">{member.microsoft_email}</span>
                            </>
                          ) : (
                            <span className="text-sm text-muted-foreground italic">Not set</span>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingEmailId(member.user_id);
                              setEmailDraft(member.microsoft_email || "");
                            }}
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={currentRole}
                        onValueChange={(value) => handleRoleChange(member.user_id, value)}
                        disabled={updatingId === member.user_id}
                      >
                        <SelectTrigger className="w-[140px]">
                          {updatingId === member.user_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <SelectValue />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(roleConfig).map(([key, roleConf]) => (
                            <SelectItem key={key} value={key}>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${roleConf.color}`} />
                                {roleConf.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(member.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
