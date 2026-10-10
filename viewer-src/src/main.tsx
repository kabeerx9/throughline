import { render } from "preact";
import { Reader } from "./Reader.tsx";
import type { ViewerData } from "./types.ts";
import "./styles.css";

async function load(): Promise<ViewerData | null> {
  const el = document.getElementById("throughline-data");
  const embedded = el?.textContent ? (JSON.parse(el.textContent) as ViewerData | null) : null;
  if (embedded) return embedded;
  if (import.meta.env.DEV) {
    // `npm run dev` reads the committed demo so the viewer can be worked on alone.
    const [change, walkthrough] = await Promise.all([
      import("../../examples/rate-limiter/change.json"),
      import("../../examples/rate-limiter/walkthrough.json"),
    ]);
    return {
      change: change.default as unknown as ViewerData["change"],
      walkthrough: walkthrough.default as unknown as ViewerData["walkthrough"],
      profile: { knows: ["TypeScript"], learning: ["Go"] },
    };
  }
  return null;
}

const root = document.getElementById("root")!;
load()
  .then((data) => {
    if (data) render(<Reader data={data} />, root);
    else
      root.innerHTML =
        '<p class="empty">No walkthrough is embedded in this page. Run <code>node scripts/show.mjs &lt;dir&gt;</code> to build one.</p>';
  })
  .catch((e: unknown) => {
    root.textContent = "Could not read the embedded walkthrough: " + String(e);
  });
