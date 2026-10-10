import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Diagram as DiagramData } from "./types.ts";
import baseCss from "./lesson-assets/base.css?raw";
import vizCss from "./lesson-assets/viz.css?raw";
import vizJs from "./lesson-assets/viz.js?raw";

const scriptText = (s: string) => s.replace(/<\/script/gi, "<\\/script");
const FRAME_CSS =
  "body{padding:1px;margin:0;overflow:hidden;background:transparent}figure.viz{margin:0;border:0;padding:0}.viz svg{max-width:100%;height:auto}svg text{font-family:var(--course-font-ui)}.breakout{width:100%;margin-inline:0;max-width:100%}.cards{grid-template-columns:1fr}.viz-caption{overflow-wrap:anywhere}button:focus-visible{outline:2px solid var(--course-color-focus);outline-offset:2px}";

function nonce() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The authored HTML and script run in an iframe with sandbox="allow-scripts" and
 * no allow-same-origin: an opaque origin with no access to this page, its storage
 * or the network (the CSP below also blocks fetches). Only size messages
 * from that exact frame are accepted. Wheel events over the frame chain to the
 * explanation pane natively, because the frame itself never scrolls.
 */
export function diagramDocument(d: DiagramData) {
  const n = nonce();
  const csp = `default-src 'none'; script-src 'nonce-${n}'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'`;
  const bridge = `
    const report = () => parent.postMessage({type:"throughline:diagram-size", height: document.documentElement.scrollHeight}, "*");
    new ResizeObserver(report).observe(document.body);
    addEventListener("load", report);
    document.addEventListener("click", e => { if (e.target.closest("a")) e.preventDefault(); });`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${baseCss}\n${vizCss}\n${FRAME_CSS}</style></head><body>${d.html}<script nonce="${n}">${scriptText(vizJs)}</script><script nonce="${n}">${scriptText(d.script || "")}</script><script nonce="${n}">${bridge}</script></body></html>`;
}

export function Diagram({ diagram, title }: { diagram: DiagramData; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(diagram.height || 420);
  const doc = useMemo(() => diagramDocument(diagram), [diagram]);
  useEffect(() => {
    function message(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== "null") return;
      const data = event.data as { type?: string; height?: number };
      if (data?.type === "throughline:diagram-size" && Number.isFinite(data.height))
        setHeight(Math.min(2400, Math.max(120, data.height! + 4)));
    }
    window.addEventListener("message", message);
    return () => window.removeEventListener("message", message);
  }, []);
  return (
    <figure class="lesson-diagram">
      <iframe ref={frame} title={"Diagram: " + title} sandbox="allow-scripts" srcdoc={doc} style={{ height: `${height}px` }} />
      {diagram.caption && <figcaption>{diagram.caption}</figcaption>}
    </figure>
  );
}
