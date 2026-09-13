import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAdminToken } from "@/lib/local-session";
import { listSupportCustomers, updateSupportCustomer } from "@/lib/support-staff.functions";
import { relativeTime } from "@/lib/support-shared";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Support Customers — Winstone Support Desk" },
      {
        name: "description",
        content:
          "Every person who contacted support, with their open conversations, company details and internal notes in one place.",
      },
      { property: "og:title", content: "Support Customers — Winstone Support Desk" },
      {
        property: "og:description",
        content: "Customer context for faster, better-informed support replies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <AppShell>
      <p className="text-sm text-destructive">Customers could not be loaded.</p>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-sm text-muted-foreground">Not found.</p>
    </AppShell>
  ),
  component: CustomersPage,
});

function CustomersPage() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", company: "", phone: "", notes: "" });

  const customers = useQuery({
    queryKey: ["support", "customers", search, adminToken],
    queryFn: () => listSupportCustomers({ data: { adminToken, search: search.trim() || undefined } }),
  });

  const save = useMutation({
    mutationFn: (customerId: string) =>
      updateSupportCustomer({
        data: {
          adminToken,
          customerId,
          name: form.name.trim() || null,
          company: form.company.trim() || null,
          phone: form.phone.trim() || null,
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: () => {
      setEditing(null);
      toast.success("Customer updated");
      void queryClient.invalidateQueries({ queryKey: ["support", "customers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = customers.data?.customers ?? [];

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Users className="size-5 text-primary" /> Support customers
          </h1>
          <p className="text-xs text-muted-foreground">{rows.length} contact records</p>
        </div>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email or company"
          className="h-9 w-64"
          aria-label="Search customers"
        />
      </div>

      {customers.isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </p>
      )}

      {!customers.isLoading && rows.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No customers yet — records are created the first time somebody contacts support.
        </p>
      )}

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((customer) => (
          <li key={customer.id} className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">{customer.name ?? "Unnamed contact"}</p>
            <p className="text-xs text-muted-foreground">{customer.email ?? "no email"}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {customer.company ? `${customer.company} · ` : ""}
              {customer.stats.open} open / {customer.stats.total} total · last seen{" "}
              {relativeTime(customer.last_seen_at)}
            </p>
            {customer.notes && (
              <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/60 px-2 py-1.5 text-xs">
                {customer.notes}
              </p>
            )}

            {editing === customer.id ? (
              <div className="mt-3 space-y-2">
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Name"
                  className="h-8 text-xs"
                />
                <Input
                  value={form.company}
                  onChange={(event) => setForm({ ...form, company: event.target.value })}
                  placeholder="Company"
                  className="h-8 text-xs"
                />
                <Input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="Phone"
                  className="h-8 text-xs"
                />
                <Textarea
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  placeholder="Internal notes"
                  rows={2}
                  className="text-xs"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={save.isPending}
                    onClick={() => save.mutate(customer.id)}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 h-8 text-xs"
                onClick={() => {
                  setEditing(customer.id);
                  setForm({
                    name: customer.name ?? "",
                    company: customer.company ?? "",
                    phone: customer.phone ?? "",
                    notes: customer.notes ?? "",
                  });
                }}
              >
                Edit details
              </Button>
            )}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
