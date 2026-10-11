/* global __dirname, console, process */
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const root = require("node:path").resolve(__dirname, "..");
const code = ts.transpileModule(
  fs.readFileSync(root + "/src/modules/searchEngine.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  },
).outputText;

function load(ids, records, hooks = {}) {
  const calls = { searches: 0, conditions: [], batches: [], yields: 0 };
  const api = { exports: {} };
  vm.runInNewContext(code, {
    exports: api.exports,
    Zotero: {
      Search: class {
        addCondition(...args) {
          calls.conditions.push(args);
        }
        async search() {
          assert.equal(this.libraryID, 1);
          calls.searches++;
          hooks.search?.();
          return ids;
        }
      },
      Items: {
        async getAsync(batch) {
          assert.ok(Array.isArray(batch));
          calls.batches.push(Array.from(batch));
          hooks.load?.();
          return batch.map((id) => records.get(id)).filter(Boolean);
        },
      },
      Promise: {
        async delay() {
          calls.yields++;
        },
      },
    },
  });
  return { collect: api.exports.collectAuthorResults, calls };
}
const source = { id: 0, libraryID: 1 };
const creators = [
  { lastName: "Smith", firstName: "Alice" },
  { lastName: "Chen", firstName: "Bo" },
  { lastName: "SMITH", firstName: "Alice" },
  { lastName: "  " },
];
const options = {
  match: (a, b, mode) =>
    a.lastName.toLowerCase() === b.lastName.toLowerCase() &&
    (mode === "Surname" || a.firstName === b.firstName),
  affiliation: () => "University",
};
function item(id, extra = {}) {
  return {
    id,
    libraryID: 1,
    isRegularItem: () => true,
    getCreators: () => [creators[1], creators[0]],
    ...extra,
  };
}

async function main() {
  const records = new Map(
    Array.from({ length: 251 }, (_, n) => [n + 1, item(n + 1)]),
  );
  records.set(2, item(2, { deleted: true }));
  records.set(3, item(3, { libraryID: 99 }));
  records.set(4, item(4, { isRegularItem: () => false }));
  records.delete(5); // Item deleted while the query was running.
  records.set(6, item(6, { getCreators: () => [{ lastName: "Smithsonian" }] }));
  const ids = [0, ...records.keys(), 5, 1, 7];
  const normal = load(ids, records);
  const progress = [];
  const results = await normal.collect(source, creators, "Strict", {
    ...options,
    onProgress: (...args) => progress.push(args),
  });
  assert.equal(normal.calls.searches, 1);
  assert.deepEqual(normal.calls.conditions, [
    ["joinMode", "any"],
    ["creator", "contains", "SMITH"],
    ["creator", "contains", "Chen"],
  ]);
  assert.deepEqual(
    normal.calls.batches.map((batch) => batch.length),
    [100, 100, 51],
  );
  assert.equal(new Set(normal.calls.batches.flat()).size, 251);
  assert.equal(results.length, 246);
  assert.equal(results[0].item.id, 1);
  assert.deepEqual(Array.from(results[0].matchedAuthors), [
    "Smith Alice",
    "Chen Bo",
  ]);
  assert.deepEqual(Array.from(results[0].affiliations), ["University"]);
  assert.deepEqual(progress, [
    [0, 251],
    [100, 251],
    [200, 251],
    [251, 251],
  ]);
  assert.equal(normal.calls.yields, 4);

  const strict = load(
    [1],
    new Map([
      [
        1,
        item(1, {
          getCreators: () => [{ lastName: "Smith", firstName: "Charles" }],
        }),
      ],
    ]),
  );
  assert.equal(
    (await strict.collect(source, creators, "Strict", options)).length,
    0,
  );
  assert.equal(
    (await strict.collect(source, creators, "Surname", options)).length,
    1,
  );

  const stopped = load(ids, records);
  assert.equal(
    (
      await stopped.collect(source, creators, "Strict", {
        ...options,
        isCancelled: () => true,
      })
    ).length,
    0,
  );
  assert.equal(stopped.calls.searches, 0);

  let cancelled = false;
  const duringQuery = load(ids, records, {
    search: () => {
      cancelled = true;
    },
  });
  assert.equal(
    (
      await duringQuery.collect(source, creators, "Strict", {
        ...options,
        isCancelled: () => cancelled,
      })
    ).length,
    0,
  );
  assert.equal(duringQuery.calls.batches.length, 0);

  cancelled = false;
  const partial = load(ids, records);
  assert.equal(
    (
      await partial.collect(source, creators, "Strict", {
        ...options,
        isCancelled: () => cancelled,
        onProgress: (processed) => {
          if (processed) cancelled = true;
        },
      })
    ).length,
    0,
  );
  assert.equal(partial.calls.batches.length, 1);

  const empty = load([], records);
  assert.equal(
    (await empty.collect(source, [{ lastName: " " }], "Strict", options))
      .length,
    0,
  );
  assert.equal(empty.calls.searches, 0);
  console.log(
    "PASS: one union query, distinct surnames, 100-item batches, unique candidates, multi-author labels, matching modes, excluded items, progress, yielding and cancellation",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
