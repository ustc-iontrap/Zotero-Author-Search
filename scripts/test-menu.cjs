/* global __dirname, console */
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const root = require("node:path").resolve(__dirname, "..");
const modes = { Flexible: "Flexible", Strict: "Strict", Surname: "Surname" };
function load(manager) {
  const calls = [],
    errors = [];
  const api = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync(root + "/src/utils/menu.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  vm.runInNewContext(code, {
    exports: api.exports,
    Zotero: { MenuManager: manager, logError: (e) => errors.push(e) },
    require: (id) => {
      if (id.includes("package.json"))
        return {
          config: {
            addonRef: "authorsearch",
            addonID: "authorsearch@euclpts.com",
          },
        };
      if (id.includes("authorSearch"))
        return {
          MatchingMode: modes,
          AuthorSearchFactory: { searchAuthors: (...args) => calls.push(args) },
        };
      if (id.includes("locale")) return { getString: (key) => key };
      throw Error(id);
    },
  });
  return { ...api.exports, calls, errors };
}
function makeWindow(items) {
  const win = {};
  class El {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.attrs = {};
      this.listeners = {};
      this.ownerDocument = doc;
    }
    setAttribute(key, value) {
      this.attrs[key] = value;
    }
    appendChild(child) {
      child.parent = this;
      this.children.push(child);
    }
    remove() {
      if (this.parent) {
        this.parent.children = this.parent.children.filter((x) => x !== this);
        this.parent = null;
      }
    }
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    }
  }
  const doc = {
    defaultView: win,
    createXULElement: (tag) => new El(tag),
    getElementById: () => popup,
    querySelectorAll: () =>
      popup.children.filter((el) => el.attrs["data-authorsearch-menu"]),
  };
  const popup = new El("menupopup");
  win.document = doc;
  win.ZoteroPane = { getSelectedItems: () => items };
  win.popup = popup;
  return win;
}
let registrations = [],
  unregistered = [];
const native = load({
  registerMenu: (opts) => (registrations.push(opts), "native-id"),
  unregisterMenu: (id) => unregistered.push(id),
});
const w1 = makeWindow(["one"]),
  w2 = makeWindow(["two"]);
native.registerAuthorSearchMenu(w1);
native.registerAuthorSearchMenu(w2);
assert.equal(registrations.length, 1);
assert.equal(w1.popup.children.length, 0);
const menu = registrations[0].menus[0];
assert.equal(menu.menus.length, 3);
const elem = w2.document.createXULElement("menuitem");
w2.popup.appendChild(elem);
menu.menus[1].onShowing({}, { menuElem: elem });
assert.equal(elem.attrs.label, "search-mode-strict");
const chosen = ["context-selection"];
menu.menus[1].onCommand({}, { menuElem: elem, items: chosen });
chosen.push("later");
assert.equal(native.calls[0][0], "Strict");
assert.equal(native.calls[0][1].pane, w2.ZoteroPane);
assert.equal(native.calls[0][1].items.length, 1);
assert.equal(native.calls[0][1].items[0], "context-selection");
native.unregisterAuthorSearchWindow(w1);
assert.equal(unregistered.length, 0);
native.unregisterAuthorSearchMenus();
assert.deepEqual(unregistered, ["native-id"]);
assert.equal(w2.popup.children.length, 0);
const legacy = load(undefined),
  a = makeWindow(["a"]),
  b = makeWindow(["b"]);
legacy.registerAuthorSearchMenu(a);
legacy.registerAuthorSearchMenu(a);
legacy.registerAuthorSearchMenu(b);
assert.equal(a.popup.children.length, 1);
assert.equal(b.popup.children.length, 1);
a.popup.children[0].children[0].children[2].listeners.command({});
assert.equal(legacy.calls[0][0], "Surname");
assert.equal(legacy.calls[0][1].pane, a.ZoteroPane);
legacy.unregisterAuthorSearchWindow(a);
assert.equal(a.popup.children.length, 0);
assert.equal(b.popup.children.length, 1);
legacy.unregisterAuthorSearchMenus();
assert.equal(b.popup.children.length, 0);
const rejected = load({
    registerMenu: () => false,
    unregisterMenu: () => true,
  }),
  c = makeWindow([]);
rejected.registerAuthorSearchMenu(c);
assert.equal(rejected.errors.length, 1);
assert.equal(c.popup.children.length, 1);
rejected.unregisterAuthorSearchMenus();
const broken = load({
    registerMenu: () => "id",
    unregisterMenu: () => {
      throw Error("broken");
    },
  }),
  d = makeWindow([]);
broken.registerAuthorSearchMenu(d);
const marked = d.document.createXULElement("menu");
marked.setAttribute("data-authorsearch-menu", "authorsearch");
d.popup.appendChild(marked);
broken.unregisterAuthorSearchMenus();
assert.equal(broken.errors.length, 1);
assert.equal(d.popup.children.length, 0);
console.log(
  "PASS: official API, three modes, localized labels, origin window, selection snapshot, multiwindow lifecycle, legacy fallback, rejected registration and failed-unregister cleanup",
);
