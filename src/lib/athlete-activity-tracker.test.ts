import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("navigation and clicks share a batch, which is flushed on pagehide", () => {
  let pathname = "/athlete";
  let hook = 0;
  const refs: Array<{ current: unknown }> = [];
  const effects: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  const events = new Map<string, (event?: unknown) => void>();
  const storage = new Map<string, string>();
  const sent: Array<{ actions: Array<{ action: string; path: string }> }> = [];
  let timer: (() => void) | undefined;
  const window = {
    location: { pathname },
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    setTimeout: (callback: () => void) => { timer = callback; return 1; }, clearTimeout: () => { timer = undefined; },
    addEventListener: (name: string, fn: (event?: unknown) => void) => events.set(name, fn), removeEventListener: (name: string) => events.delete(name)
  };
  class Element {
    closest() { return this; }
    getAttribute() { return null; }
    textContent = "Suivant";
  }
  const document = { addEventListener: (name: string, fn: (event?: unknown) => void) => events.set(name, fn), removeEventListener: (name: string) => events.delete(name) };
  const react = {
    useRef: (value: unknown) => refs[hook] ?? (refs[hook] = { current: value }),
    useEffect: (fn: () => void | (() => void), deps: unknown[]) => {
      const index = hook++;
      if (!effects[index] || deps.some((value, i) => value !== effects[index].deps[i])) {
        effects[index]?.cleanup?.();
        effects[index] = { deps, cleanup: fn() || undefined };
      }
    }
  };
  // useRef and useEffect share React's hook ordering.
  const originalRef = react.useRef;
  react.useRef = (value: unknown) => { const ref = originalRef(value); hook++; return ref; };
  const exports: { AthleteActivityTracker?: () => void } = {};
  runInNewContext(ts.transpileModule(readFileSync("src/components/athlete/activity-tracker.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, window, document, Element, crypto: { randomUUID: () => "visit" },
    fetch: (_url: string, options: { body: string }) => { sent.push(JSON.parse(options.body)); return Promise.resolve(); },
    require: (name: string) => name === "react" ? react : name === "next/navigation" ? { usePathname: () => pathname } : {}
  });
  const render = () => { hook = 0; exports.AthleteActivityTracker!(); };
  render();
  events.get("click")?.({ target: new Element() });
  pathname = "/athlete/calendar"; window.location.pathname = pathname; render();
  assert.equal(sent.length, 0);
  assert.ok(timer);
  events.get("pagehide")?.();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].actions.map((action) => action.action), ["Ouverture de l’application", "Clic : Suivant", "Navigation vers /athlete/calendar"]);
  assert.equal(timer, undefined);
  effects.forEach((effect) => effect.cleanup?.());
  assert.equal(sent.length, 1);
});
