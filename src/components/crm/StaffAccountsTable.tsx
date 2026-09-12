import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createStaffAccount,
  listStaffAccounts,
  updateStaffAccount,
} from "@/lib/accounts.functions";
import { getAdminToken, useAdminToken } from "@/lib/local-session";

type Draft = { name: string; employeeId: string; phone: string; password: string; role: "agent" | "coordinator" };

const EMPTY: Draft = { name: "", employeeId: "", phone: "", password: "", role: "agent" };

/** IT Console desk roster: open an account here, and edit name / ID / phone / password. */
export function StaffAccountsTable() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const create = useServerFn(createStaffAccount);
  const update = useServerFn(updateStaffAccount);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ name: string; employeeId: string; phone: string; password: string }>({
    name: "",
    employeeId: "",
    phone: "",
    password: "",
  });

  const list = useQuery({
    queryKey: ["staff-accounts"],
    queryFn: () => listStaffAccounts({ data: { adminToken: adminToken ?? "" } }),
    enabled: Boolean(adminToken),
    refetchInterval: 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["staff-accounts"] });
    void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
  };

  const add = useMutation({
    mutationFn: () => create({ data: { adminToken: getAdminToken(), ...draft } }),
    onSuccess: () => {
      toast.success("অ্যাকাউন্ট খোলা হয়েছে");
      setDraft(EMPTY);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: (profileId: string) =>
      update({
        data: {
          adminToken: getAdminToken(),
          profileId,
          ...(edit.name ? { name: edit.name } : {}),
          ...(edit.employeeId ? { employeeId: edit.employeeId } : {}),
          ...(edit.phone ? { phone: edit.phone } : {}),
          ...(edit.password ? { password: edit.password } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("হালনাগাদ হয়েছে");
      setEditing(null);
      setEdit({ name: "", employeeId: "", phone: "", password: "" });
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: (input: { profileId: string; isActive: boolean }) =>
      update({ data: { adminToken: getAdminToken(), ...input } }),
    onSuccess: () => {
      toast.success("স্ট্যাটাস বদলেছে");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const staff = list.data?.staff ?? [];

  return (
    <section className="card-elevated p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Users className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">এজেন্ট অ্যাকাউন্ট</h2>
        <span className="ml-auto text-xs text-muted-foreground">{staff.length} জন</span>
      </header>

      <div className="mt-3 grid gap-2 sm:grid-cols-6">
        <Input
          className="sm:col-span-2"
          placeholder="এজেন্টের নাম"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <Input
          placeholder="Agent ID"
          value={draft.employeeId}
          onChange={(e) => setDraft({ ...draft, employeeId: e.target.value })}
        />
        <Input
          placeholder="ফোন নম্বর"
          value={draft.phone}
          onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
        />
        <Input
          placeholder="পাসওয়ার্ড"
          value={draft.password}
          onChange={(e) => setDraft({ ...draft, password: e.target.value })}
        />
        <div className="flex gap-2">
          <Select
            value={draft.role}
            onValueChange={(value) => setDraft({ ...draft, role: value as Draft["role"] })}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">এজেন্ট</SelectItem>
              <SelectItem value="coordinator">কোঅর্ডিনেটর</SelectItem>
            </SelectContent>
          </Select>
          <Button
            className="flex-1"
            disabled={add.isPending || !draft.name || !draft.employeeId || !draft.phone || draft.password.length < 6}
            onClick={() => add.mutate()}
          >
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            খুলুন
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3">এজেন্টের নাম</th>
              <th className="py-2 pr-3">Agent ID</th>
              <th className="py-2 pr-3">ফোন নম্বর</th>
              <th className="py-2 pr-3">পাসওয়ার্ড</th>
              <th className="py-2 pr-3">অ্যাসাইন করা লিড</th>
              <th className="py-2">অবস্থা</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {staff.map((row) => {
              const isEditing = editing === row.id;
              return (
                <tr key={row.id}>
                  <td className="py-2 pr-3">
                    {isEditing ? (
                      <Input
                        className="h-8"
                        defaultValue={row.name}
                        onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))}
                      />
                    ) : (
                      <span className="font-medium">{row.name}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 tabular">
                    {isEditing ? (
                      <Input
                        className="h-8"
                        defaultValue={row.employee_id ?? ""}
                        onChange={(e) => setEdit((s) => ({ ...s, employeeId: e.target.value }))}
                      />
                    ) : (
                      row.employee_id ?? "—"
                    )}
                  </td>
                  <td className="py-2 pr-3 tabular">
                    {isEditing ? (
                      <Input
                        className="h-8"
                        defaultValue={row.phone ?? ""}
                        onChange={(e) => setEdit((s) => ({ ...s, phone: e.target.value }))}
                      />
                    ) : (
                      row.phone ?? "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {isEditing ? (
                      <Input
                        className="h-8"
                        placeholder="নতুন পাসওয়ার্ড"
                        onChange={(e) => setEdit((s) => ({ ...s, password: e.target.value }))}
                      />
                    ) : (
                      <span className="text-muted-foreground">••••••</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 tabular">{row.assignedLeads}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {row.is_active ? "সক্রিয়" : "বন্ধ"}
                      </span>
                      {isEditing ? (
                        <>
                          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(row.id)}>
                            সেভ
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            বাতিল
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditing(row.id);
                              setEdit({ name: "", employeeId: "", phone: "", password: "" });
                            }}
                          >
                            <Pencil className="size-3.5" /> এডিট
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={toggle.isPending}
                            onClick={() => toggle.mutate({ profileId: row.id, isActive: !row.is_active })}
                          >
                            {row.is_active ? "বন্ধ করুন" : "চালু করুন"}
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {list.isPending && <p className="mt-3 text-sm text-muted-foreground">তালিকা আনা হচ্ছে…</p>}
      {!list.isPending && staff.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">এখনো কোনো ডেস্ক অ্যাকাউন্ট নেই।</p>
      )}
    </section>
  );
}
