/** change.json, written by scripts/capture.mjs. */
export type DiffLine = {
  kind: "add" | "delete" | "context";
  text: string;
  oldLine?: number;
  newLine?: number;
};
export type Hunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
};
export type ChangedFile = {
  path: string;
  oldPath?: string;
  repo: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  isTest: boolean;
  binary?: boolean;
  omitted?: string;
  hunks: Hunk[];
};
export type Repo = {
  name: string;
  root: string;
  mode: string;
  branch?: string;
  base: string;
  baseLabel: string;
  head: string;
};
export type Change = {
  version: number;
  id: string;
  createdAt: string;
  repos: Repo[];
  files: ChangedFile[];
};

/** walkthrough.json, written by the agent (see reference/format.md). */
export type Side = "after" | "before";
export type LineRange = {
  path?: string;
  side?: Side;
  startLine: number;
  endLine: number;
};
export type Anchor = LineRange & { id?: string; note?: string };
/** A range with every field resolved, used for highlighting. */
export type Highlight = Required<Pick<LineRange, "path" | "side">> &
  Pick<LineRange, "startLine" | "endLine">;
export type Diagram = {
  html: string;
  script?: string;
  caption?: string;
  height?: number;
};
export type Note = {
  title: string;
  body: string;
  code?: string;
  lang?: string;
  vs?: string;
  vsLang?: string;
  lines?: LineRange;
};
export type QuizQuestion = {
  prompt: string;
  options: string[];
  correct: number;
  answer: string;
};
export type Decision = {
  title: string;
  choice: string;
  alternatives?: string;
  tradeoff?: string;
};
export type Overview = {
  title: string;
  explanation: string;
  diagrams?: Diagram[];
  decisions?: Decision[];
  remember?: string;
  quiz?: QuizQuestion[];
  notes?: Note[];
};
/** One step of a file's code tour: a block of the diff and what it does. */
export type TourStep = {
  lines: { start: number; end: number; side?: Side };
  title?: string;
  text: string;
};
export type FileLesson = {
  path: string;
  role: string;
  explanation: string;
  isTest?: boolean;
  diagram?: Diagram;
  remember?: string;
  anchors?: Anchor[];
  notes?: Note[];
  tour?: TourStep[];
};
export type Walkthrough = {
  title: string;
  changeId?: string;
  overview: Overview;
  files: FileLesson[];
};
export type Profile = { knows: string[]; learning: string[]; goal?: string };
export type ViewerData = {
  change: Change;
  walkthrough: Walkthrough;
  profile: Profile | null;
};
