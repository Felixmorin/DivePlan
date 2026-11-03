import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

type Node = { type: unknown; props: Record<string, unknown> };
const fixture = (n: number) => ({
  id: `exercise-${n}`, name: `Exercise ${String(n).padStart(2, "0")}`, category: "Technique", level: null,
  description: "Synthetic instructions", bodyArea: null, equipment: null, setup: null,
  defaultSets: 2, defaultReps: 8, defaultDuration: null, roundTrip: false, restSeconds: 20,
  coachNotes: null, favorite: true, lastUsed: null,
});
type Exercise = ReturnType<typeof fixture>;
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (value && typeof value === "object" && "props" in value) return text((value as Node).props.children);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function find(root: Node, predicate: (node: Node) => boolean): Node {
  const node = nodes(root).find(predicate); assert.ok(node, "Expected UI control"); return node;
}
function call(node: Node, key: string, ...args: unknown[]) {
  return (node.props[key] as (...args: unknown[]) => unknown)(...args);
}
function mount(legacy = false) {
  const states: unknown[] = []; let cursor = 0; let rendering = false; let rerender = false;
  let refreshes = 0; let mutations = 0; let transitions: Promise<unknown>[] = [];
  let fail = false;
  const action = async () => { mutations++; if (fail) throw new Error("Synthetic failure"); return false; };
  let source = readFileSync("src/app/coach/library/library-client.tsx", "utf8");
  if (legacy) source = source.replace("if (page > pageCount) setPage(pageCount);", "");
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    react: {
      useMemo: (fn: () => unknown) => fn(),
      useTransition: () => [false, (fn: () => Promise<unknown>) => transitions.push(Promise.resolve().then(fn))],
      useState: (initial: unknown) => {
        const index = cursor++; if (!(index in states)) states[index] = initial;
        return [states[index], (next: unknown) => {
          const value = typeof next === "function" ? next(states[index]) : next;
          if (!Object.is(value, states[index])) { states[index] = value; if (rendering) rerender = true; }
        }];
      },
    },
    "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) },
    "@/app/coach/library/actions": { archiveLibraryExercise: action, toggleLibraryExerciseFavorite: action, saveLibraryExercise: action },
    "@/components/ui/toast-provider": { useToast: () => ({ notify: () => {} }) },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/components/ui/badge": { Badge: () => null }, "@/components/ui/button": { Button: () => null },
    "@/components/ui/input": { Input: () => null }, "@/lib/utils": { cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") },
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return {
    render(exercises: Exercise[]) {
      for (let attempt = 0; attempt < 3; attempt++) {
        cursor = 0; rendering = true; rerender = false;
        const root = (exports.LibraryClient as (props: Record<string, unknown>) => Node)({ exercises, dives: [], templates: [] });
        rendering = false; if (!rerender) return root;
      }
      throw new Error("Render did not stabilize");
    },
    async flush() { await Promise.all(transitions); transitions = []; },
    fail() { fail = true; },
    stats: () => ({ refreshes, mutations }),
  };
}
const rows = (root: Node) => nodes(root).filter(n => typeof n.props["aria-label"] === "string" && String(n.props["aria-label"]).startsWith("Sélectionner ")).map(n => String(n.props["aria-label"]));
const page = (root: Node, n: number) => call(find(root, node => node.type === "button" && node.props.children === n), "onClick");
const range = (root: Node) => text(find(root, n => n.type === "span" && /^\d+ – \d+ sur \d+$/.test(text(n.props.children))).props.children);

test("library pagination follows updated server results without hiding remaining exercises", async t => {
  const seven = Array.from({ length: 7 }, (_, i) => fixture(i + 1));
  await t.test("archive of the sole row on page two: zero visible rows -> six", async () => {
    for (const legacy of [true, false]) {
      const app = mount(legacy); page(app.render(seven), 2);
      let root = app.render(seven); assert.equal(rows(root).length, 1);
      call(find(root, n => n.type === "button" && text(n.props.children) === "Supprimer"), "onClick");
      root = app.render(seven);
      const dialog = find(root, n => n.props.role === "alertdialog");
      call(find(dialog, n => typeof n.props.onClick === "function" && text(n.props.children) === "Supprimer"), "onClick");
      await app.flush(); const beforeUpdate = app.stats(); root = app.render(seven.slice(0, 6));
      assert.equal(rows(root).length, legacy ? 0 : 6);
      assert.equal(range(root), legacy ? "7 – 6 sur 6" : "1 – 6 sur 6");
      assert.equal(text(root).includes("Aucun exercice trouvé."), legacy);
      assert.equal(app.stats().mutations, 1);
      assert.deepEqual(app.stats(), beforeUpdate, "page adjustment adds no refresh or mutation");
    }
    t.diagnostic("Synthetic archive, 7 -> 6 exercises: displayed rows 0 -> 6; invalid range 7–6 -> 1–6. No additional refresh or action.");
  });
  await t.test("removing the last favorite from page two selects the remaining favorite page", async () => {
    const app = mount(); let root = app.render(seven);
    call(find(root, n => n.type === "button" && text(n.props.children).trim() === "Favoris"), "onClick");
    page(app.render(seven), 2); root = app.render(seven);
    call(find(root, n => n.props["aria-label"] === "Favori"), "onClick"); await app.flush();
    root = app.render(seven.map((item, i) => i === 6 ? { ...item, favorite: false } : item));
    assert.equal(rows(root).length, 6); assert.equal(range(root), "1 – 6 sur 6");
  });
  await t.test("valid pages remain selected; shrinking several pages clamps to the last page", () => {
    const app = mount(); const many = Array.from({ length: 20 }, (_, i) => fixture(i + 1));
    page(app.render(many), 4); assert.equal(range(app.render(many)), "19 – 20 sur 20");
    assert.equal(range(app.render(many.slice(0, 19))), "19 – 19 sur 19");
    assert.equal(range(app.render(many.slice(0, 8))), "7 – 8 sur 8");
    assert.deepEqual(rows(app.render(many.slice(0, 8))), ["Sélectionner Exercise 07", "Sélectionner Exercise 08"]);
    assert.equal(range(app.render(many)), "7 – 12 sur 20", "growth must not restore the obsolete fourth page");
    assert.deepEqual(app.stats(), { refreshes: 0, mutations: 0 });
  });
  await t.test("empty results reset safely and subsequent data starts on the first page", () => {
    const app = mount(); page(app.render(seven), 2);
    let root = app.render([]); assert.equal(rows(root).length, 0); assert.equal(range(root), "0 – 0 sur 0");
    assert.equal(find(root, n => n.type === "button" && n.props.children === "›").props.disabled, true);
    root = app.render(seven); assert.equal(range(root), "1 – 6 sur 7");
    page(root, 2); assert.equal(range(app.render(seven)), "7 – 7 sur 7");
  });
  await t.test("failed archive leaves the current page and dialog available for retry", async () => {
    const app = mount(); page(app.render(seven), 2); let root = app.render(seven);
    call(find(root, n => n.type === "button" && text(n.props.children) === "Supprimer"), "onClick");
    root = app.render(seven); const dialog = find(root, n => n.props.role === "alertdialog");
    app.fail(); call(find(dialog, n => typeof n.props.onClick === "function" && text(n.props.children) === "Supprimer"), "onClick");
    await app.flush(); root = app.render(seven);
    assert.equal(range(root), "7 – 7 sur 7"); assert.equal(rows(root).length, 1);
    assert.ok(find(root, n => n.props.role === "alertdialog")); assert.deepEqual(app.stats(), { refreshes: 0, mutations: 1 });
  });
  await t.test("search, material and category changes still reset pagination", () => {
    for (const kind of ["search", "material", "category"]) {
      const app = mount(); page(app.render(seven), 2); const root = app.render(seven);
      if (kind === "search") call(find(root, n => n.props.placeholder === "Rechercher un exercice…"), "onChange", { target: { value: "Exercise" } });
      if (kind === "material") call(find(root, n => n.type === "select" && n.props.value === "Tous"), "onChange", { target: { value: "Sans matériel" } });
      if (kind === "category") call(find(root, n => n.type === "button" && text(n.props.children).endsWith("Technique")), "onClick");
      assert.equal(range(app.render(seven)), "1 – 6 sur 7");
    }
  });
});
