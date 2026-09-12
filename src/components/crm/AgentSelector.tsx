import { UserRound } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSnapshot } from "@/lib/crm-data";
import { setOperatorId, useOperatorId } from "@/lib/local-session";

const NONE = "__none__";

/** "Operating as" switcher: picks which agent manual logs are attributed to. No login needed. */
export function AgentSelector() {
  const data = useSnapshot();
  const operatorId = useOperatorId();
  const agents = data.profiles.filter(
    (p) =>
      p.is_active &&
      p.approval_status === "approved" &&
      (p.role === "agent" || p.role === "team_leader"),
  );
  const current = agents.find((a) => a.id === operatorId);

  return (
    <Select
      value={current ? current.id : NONE}
      onValueChange={(value) => setOperatorId(value === NONE ? null : value)}
    >
      <SelectTrigger
        className="h-9 w-auto min-w-0 max-w-[130px] gap-1.5 border-border/70 bg-secondary/60 text-xs sm:max-w-[240px] sm:gap-2"
        aria-label="Operating as"
      >
        <UserRound className="size-4 shrink-0 text-muted-foreground" />
        <span className="hidden text-muted-foreground sm:inline">Operating as:</span>
        <SelectValue placeholder="Select agent" />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={NONE}>Observer (no agent)</SelectItem>
        {agents.map((agent) => (
          <SelectItem key={agent.id} value={agent.id}>
            {agent.name}
            {agent.employee_id ? ` · ${agent.employee_id}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
