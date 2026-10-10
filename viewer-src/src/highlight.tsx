import Prism from "prismjs";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-java";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-docker";
import type { ComponentChildren } from "preact";

const byExtension: Record<string, string> = {
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  py: "python", go: "go", rs: "rust", java: "java", kt: "kotlin", swift: "swift",
  rb: "ruby", json: "json", yml: "yaml", yaml: "yaml", toml: "toml",
  sh: "bash", bash: "bash", zsh: "bash", sql: "sql", md: "markdown",
  css: "css", html: "markup", xml: "markup", svg: "markup",
};
const byName: Record<string, string> = {
  typescript: "typescript", ts: "typescript", javascript: "javascript", js: "javascript",
  react: "tsx", "react native": "tsx", tsx: "tsx", jsx: "jsx", python: "python",
  go: "go", golang: "go", rust: "rust", java: "java", kotlin: "kotlin", swift: "swift",
  ruby: "ruby", json: "json", yaml: "yaml", bash: "bash", shell: "bash", sql: "sql",
  css: "css", html: "markup",
};

export function languageForPath(path: string) {
  const name = path.split("/").at(-1) || "";
  if (name === "Dockerfile") return "docker";
  return byExtension[name.split(".").at(-1)?.toLowerCase() || ""] || "";
}
export function languageForName(name?: string) {
  return byName[(name || "").trim().toLowerCase()] || "";
}

function render(token: string | Prism.Token, i: number): ComponentChildren {
  if (typeof token === "string") return token;
  const content = Array.isArray(token.content)
    ? token.content.map(render)
    : render(token.content as string | Prism.Token, 0);
  return (
    <span key={i} class={"token " + token.type}>
      {content}
    </span>
  );
}

export function Code({ text, language }: { text: string; language: string }) {
  const grammar = language ? Prism.languages[language] : undefined;
  if (!grammar) return <>{text || " "}</>;
  return <>{Prism.tokenize(text, grammar).map(render)}</>;
}
