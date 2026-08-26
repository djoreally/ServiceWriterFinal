import { useState, useEffect } from "react";
import {
  fetchUsersWithRoles,
  getCurrentUserId,
  makeUserAdmin,
  removeUserAdmin,
  setMarketplaceOptIn,
  setProviderArchived,
  updateBookingSlug,
  type UserWithProfile,
} from "@/application/queries/admin-users.query";
import { AdminFeeScopeIndicator } from "@/components/admin/AdminFeeScopeIndicator";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Search,
  Shield,
  Building2,
  Mail,
  Globe,
  Archive,
  ArchiveRestore,
  Check,
  Pencil,
  MoreVertical,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { logAuditEvent } from "@/lib/auditLog";

type FilterKey = "all" | "listed" | "unlisted" | "archived";

export function AdminUserManagement() {
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [slugEditId, setSlugEditId] = useState<string | null>(null);
  const [slugDraft, setSlugDraft] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await fetchUsersWithRoles();
      setUsers(data);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load providers");
    }
    setLoading(false);
  };

  const audit = async (action: string, userId: string) => {
    const currentUserId = await getCurrentUserId();
    await logAuditEvent({
      user_id: currentUserId ?? undefined,
      action,
      entity: "business_profile",
      entity_id: userId,
      status: "success",
    });
  };

  const handleMakeAdmin = async (userId: string) => {
    try {
      await makeUserAdmin(userId);
      await audit("make_admin", userId);
      toast.success("User promoted to admin");
      fetchUsers();
    } catch {
      toast.error("Failed to update role");
    }
  };

  const handleRemoveAdmin = async (userId: string) => {
    try {
      await removeUserAdmin(userId);
      await audit("remove_admin", userId);
      toast.success("Admin role removed");
      fetchUsers();
    } catch {
      toast.error("Failed to update role");
    }
  };

  const handleToggleListing = async (user: UserWithProfile, next: boolean) => {
    if (user.deleted_at) {
      toast.error("Restore this provider before listing them publicly");
      return;
    }
    setBusyId(user.id);
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, marketplace_opt_in: next } : u)),
    );
    try {
      await setMarketplaceOptIn(user.id, next);
      await audit(next ? "marketplace_opt_in" : "marketplace_opt_out", user.id);
      toast.success(next ? "Listed in the directory" : "Removed from the directory");
    } catch {
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, marketplace_opt_in: !next } : u)),
      );
      toast.error("Failed to update listing");
    }
    setBusyId(null);
  };

  const handleToggleArchive = async (user: UserWithProfile) => {
    const archived = !user.deleted_at;
    setBusyId(user.id);
    try {
      await setProviderArchived(user.id, archived);
      await audit(archived ? "archive_provider" : "restore_provider", user.id);
      toast.success(archived ? "Provider archived" : "Provider restored");
      await fetchUsers();
    } catch {
      toast.error("Failed to update status");
    }
    setBusyId(null);
  };

  const startSlugEdit = (user: UserWithProfile) => {
    setSlugEditId(user.id);
    setSlugDraft(user.booking_slug ?? "");
  };

  const saveSlug = async (user: UserWithProfile) => {
    setBusyId(user.id);
    try {
      const saved = await updateBookingSlug(user.id, slugDraft);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, booking_slug: saved } : u)),
      );
      await audit("update_booking_slug", user.id);
      toast.success(`Booking link set to /book/${saved}`);
      setSlugEditId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update booking link");
    }
    setBusyId(null);
  };

  const filteredUsers = users
    .filter((u) => {
      if (filter === "listed") return u.marketplace_opt_in && !u.deleted_at;
      if (filter === "unlisted") return !u.marketplace_opt_in && !u.deleted_at;
      if (filter === "archived") return Boolean(u.deleted_at);
      return true;
    })
    .filter(
      (u) =>
        u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.booking_slug?.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  const listedCount = users.filter((u) => u.marketplace_opt_in && !u.deleted_at).length;
  const archivedCount = users.filter((u) => u.deleted_at).length;

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: users.length },
    { key: "listed", label: "Listed", count: listedCount },
    { key: "unlisted", label: "Unlisted", count: users.length - listedCount - archivedCount },
    { key: "archived", label: "Archived", count: archivedCount },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Providers &amp; Listings</h2>
          <p className="text-muted-foreground">
            Manage roles, marketplace visibility, booking links, and archive status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3" />
            {users.length} Providers
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Globe className="h-3 w-3" />
            {listedCount} Listed
          </Badge>
        </div>
      </div>

      <AdminFeeScopeIndicator />



      <Card>
        <CardHeader className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email, business name, or booking link..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? "default" : "outline"}
                onClick={() => setFilter(f.key)}
              >
                {f.label} ({f.count})
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Booking link</TableHead>
                    <TableHead>Listed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No providers found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.id} className={user.deleted_at ? "opacity-60" : undefined}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {user.business_name || "No business name"}
                              </div>
                              {user.role === "admin" && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-primary">
                                  <Shield className="h-3 w-3" /> Admin
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[200px]">{user.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {slugEditId === user.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={slugDraft}
                                onChange={(e) => setSlugDraft(e.target.value)}
                                className="h-8 w-36"
                                aria-label="Booking link"
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                disabled={busyId === user.id}
                                onClick={() => saveSlug(user)}
                                aria-label="Save booking link"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startSlugEdit(user)}
                              className="flex items-center gap-1 text-sm font-mono hover:text-primary"
                            >
                              /book/{user.booking_slug || "—"}
                              <Pencil className="h-3 w-3 opacity-60" />
                            </button>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={user.marketplace_opt_in && !user.deleted_at}
                            disabled={busyId === user.id || Boolean(user.deleted_at)}
                            onCheckedChange={(next) => handleToggleListing(user, next)}
                            aria-label="Marketplace listing"
                          />
                        </TableCell>
                        <TableCell>
                          {user.deleted_at ? (
                            <Badge variant="destructive">Archived</Badge>
                          ) : user.onboarding_completed ? (
                            <Badge variant="secondary">Active</Badge>
                          ) : (
                            <Badge variant="outline">Onboarding</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {user.role === "admin" ? (
                                <DropdownMenuItem onClick={() => handleRemoveAdmin(user.id)}>
                                  Remove Admin
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleMakeAdmin(user.id)}>
                                  Make Admin
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleToggleArchive(user)}>
                                {user.deleted_at ? (
                                  <>
                                    <ArchiveRestore className="h-4 w-4 mr-2" /> Restore provider
                                  </>
                                ) : (
                                  <>
                                    <Archive className="h-4 w-4 mr-2" /> Archive provider
                                  </>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
