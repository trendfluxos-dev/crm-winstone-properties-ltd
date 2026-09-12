/**
 * Minimal, dependency-free markdown renderer: headings, lists, code fences,
 * blockquotes, bold/italic/inline-code and paragraphs. Enough for the docs CMS
 * without pulling in a heavy editor/parser.
 */
function inline(text: string, key: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    const id = `${key}-${index}`;
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={id} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={id}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={id}>{part.slice(1, -1)}</em>;
    }
    return <span key={id}>{part}</span>;
  });
}

export function MarkdownView({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let code: string[] | null = null;
  let paragraph: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5">
        {list.map((item, index) => (
          <li key={index}>{inline(item, `li-${blocks.length}-${index}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ");
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-relaxed">
        {inline(text, `p-${blocks.length}`)}
      </p>,
    );
    paragraph = [];
  };

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (code) {
        blocks.push(
          <pre
            key={`pre-${blocks.length}`}
            className="overflow-x-auto rounded-lg bg-muted p-3 text-xs"
          >
            <code>{code.join("\n")}</code>
          </pre>,
        );
        code = null;
      } else {
        flushParagraph();
        flushList();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1]!.length;
      const size = ["text-2xl", "text-xl", "text-lg", "text-base"][level - 1];
      blocks.push(
        <p key={`h-${blocks.length}`} className={`${size} font-bold tracking-tight`}>
          {inline(heading[2]!, `h-${blocks.length}`)}
        </p>,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph();
      list.push(line.replace(/^\s*[-*]\s+/, ""));
      continue;
    }
    if (line.trimStart().startsWith(">")) {
      flushParagraph();
      flushList();
      blocks.push(
        <blockquote
          key={`q-${blocks.length}`}
          className="border-l-2 border-border pl-3 text-muted-foreground"
        >
          {inline(line.replace(/^\s*>\s?/, ""), `q-${blocks.length}`)}
        </blockquote>,
      );
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  if (code?.length) {
    blocks.push(
      <pre key="pre-tail" className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
        <code>{code.join("\n")}</code>
      </pre>,
    );
  }

  return <div className="space-y-3 text-sm">{blocks}</div>;
}
