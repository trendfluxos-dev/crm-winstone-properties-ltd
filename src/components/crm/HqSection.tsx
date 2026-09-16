import { ChevronDown } from "lucide-react";
import { useState } from "react";

/**
 * Executive HQ module wrapper: a labelled section that can start collapsed.
 * Detail-heavy modules stay one tap away instead of stretching the page.
 */
export function HqSection({
  id,
  title,
  eyebrow,
  hint,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: string;
  eyebrow?: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4 text-left"
      >
        <span className="min-w-0">
          {eyebrow && <span className="eyebrow block">{eyebrow}</span>}
          <span className="mt-0.5 block truncate text-base font-semibold">{title}</span>
          {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </section>
  );
}
