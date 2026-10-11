/* global __dirname, console */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const code = ts.transpileModule(
  fs.readFileSync(
    path.resolve(__dirname, "../src/utils/resultsWindow.ts"),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  },
).outputText;
function fixture(state = "loading") {
  let now = 0,
    id = 0;
  const timers = new Map();
  const target = () => ({
    closed: false,
    listeners: new Map(),
    addEventListener(type, callback) {
      this.listeners.set(type, callback);
    },
    removeEventListener(type) {
      this.listeners.delete(type);
    },
  });
  const owner = target(),
    win = target();
  win.document = {
    readyState: state,
    body: state === "complete" ? {} : null,
  };
  owner.setTimeout = (fn) => {
    timers.set(++id, fn);
    return id;
  };
  owner.clearTimeout = (key) => timers.delete(key);
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: () => ({ default: "" }),
    Date: { now: () => now },
  });
  return {
    win,
    owner,
    timers,
    wait: exports.waitForDialogLoad,
    tick() {
      now += 50;
      for (const [key, fn] of [...timers]) {
        timers.delete(key);
        fn();
      }
    },
  };
}
(async () => {
  let f = fixture("complete");
  await f.wait(f.win, f.owner, Promise.resolve());
  assert.equal(f.timers.size, 0);
  assert.equal(f.win.listeners.size, 0);
  f = fixture();
  let ready;
  let p = f.wait(
    f.win,
    f.owner,
    new Promise((resolve) => {
      ready = resolve;
    }),
  );
  ready();
  f.tick(); // The delayed Toolkit callback resolves before the next timer tick.
  await p;
  assert.equal(f.timers.size, 0);
  f = fixture();
  p = f.wait(f.win, f.owner, new Promise(() => {}), 1);
  f.tick();
  await assert.rejects(p, /could not load/);
  assert.equal(f.win.listeners.size, 0);
  assert.equal(f.timers.size, 0);
  f = fixture();
  p = f.wait(f.win, f.owner, new Promise(() => {}));
  f.win.closed = true;
  f.tick();
  await assert.rejects(p, /closed/);
  f = fixture();
  p = f.wait(f.win, f.owner, new Promise(() => {}));
  f.owner.listeners.get("unload")();
  await assert.rejects(p, /closed/);
  assert.equal(f.timers.size, 0);
  console.log(
    "PASS: already resolved callback, delayed Toolkit callback, bounded timeout, child close, owner close and listener cleanup",
  );
})().catch((error) => {
  console.error(error);
  require("node:process").exitCode = 1;
});
