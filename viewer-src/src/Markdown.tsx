import type { ComponentChildren } from "preact";

/**
 * A deliberately small Markdown renderer: paragraphs, headings, lists, quotes,
 * fenced code, inline code, bold, italics and links. It never renders raw HTML,
 * so walkthrough text cannot inject markup into the reader.
 */
export type LinkHandlers = {
  onAnchor?: (id: string) => void;
  onAnchorHover?: (id?: string) => void;
};

function inline(text: string, h: LinkHandlers, key = 0): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|(?<![\w*])\*([^*\s][^*]*)\*(?!\w)|(?<!\w)_([^_\s][^_]*)_(?!\w)|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${m.index}`;
    if (m[1] !== undefined) out.push(<code key={k}>{m[1]}</code>);
    else if (m[2] !== undefined) out.push(<strong key={k}>{inline(m[2], h, key + 1)}</strong>);
    else if (m[3] !== undefined || m[4] !== undefined)
      out.push(<em key={k}>{inline((m[3] ?? m[4])!, h, key + 1)}</em>);
    else {
      const [label, href] = [m[5], m[6]];
      if (href.startsWith("#")) {
        const id = href.slice(1);
        out.push(
          <a
            key={k}
            href={href}
            class="anchor-link"
            onMouseEnter={() => h.onAnchorHover?.(id)}
            onMouseLeave={() => h.onAnchorHover?.(undefined)}
            onFocus={() => h.onAnchorHover?.(id)}
            onBlur={() => h.onAnchorHover?.(undefined)}
            onClick={(e) => {
              e.preventDefault();
              h.onAnchor?.(id);
            }}
          >
            {inline(label, h, key + 1)}
          </a>,
        );
      } else if (/^https?:\/\//.test(href))
        out.push(
          <a key={k} href={href} target="_blank" rel="noreferrer noopener">
            {inline(label, h, key + 1)}
          </a>,
        );
      else out.push(<span key={k}>{inline(label, h, key + 1)}</span>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, ...h }: { text: string } & LinkHandlers) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ComponentChildren[] = [];
  let i = 0;
  const isBlockStart = (l: string) => /^(```|#{1,4}\s|[-*]\s|\d+[.)]\s|>\s?)/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const key = blocks.length;
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = Math.min(4, heading[1].length + 1);
      const Tag = `h${level}` as "h2";
      blocks.push(<Tag key={key}>{inline(heading[2], h)}</Tag>);
      i++;
      continue;
    }
    const list = line.match(/^([-*]|\d+[.)])\s/);
    if (list) {
      const ordered = /\d/.test(list[1]);
      const items: string[] = [];
      while (i < lines.length && /^([-*]|\d+[.)])\s/.test(lines[i])) {
        let item = lines[i++].replace(/^([-*]|\d+[.)])\s+/, "");
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) item += " " + lines[i++].trim();
        items.push(item);
      }
      const children = items.map((t, j) => <li key={j}>{inline(t, h)}</li>);
      blocks.push(ordered ? <ol key={key}>{children}</ol> : <ul key={key}>{children}</ul>);
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) body.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key}>{inline(body.join(" "), h)}</blockquote>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i]))) para.push(lines[i++]);
    blocks.push(<p key={key}>{inline(para.join(" "), h)}</p>);
  }
  return <>{blocks}</>;
}
