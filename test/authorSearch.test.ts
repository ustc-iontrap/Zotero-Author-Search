// The check wrapper reports native Error fields that scaffold drops when serializing errors.
/* eslint-disable mocha/no-setup-in-describe */
import { assert } from "chai";

declare const Zotero: any;
declare const ChromeUtils: any;
declare const IOUtils: any;
declare const PathUtils: any;

/** Run only through scaffold's isolated profile/data directory, never a user library. */
describe("Author Search integration", function () {
  this.timeout(60000);

  function check(title: string, fn: () => Promise<void>) {
    // Keep diagnostics attached to the individual test.
    it(title, async function () {
      try {
        await fn();
      } catch (error) {
        await (window as any).send({
          type: "debug",
          data: `${title}: ${String(error)}\n${error?.stack?.split("\n").slice(0, 5).join("\n") || ""}`,
        });
        throw error;
      }
    });
  }

  let factory: any;
  let mode: any;
  let pane: any;
  let original: any;
  let exact: any;
  let initial: any;
  let surnameOnly: any;
  let unrelated: any;
  let deleted: any;
  let libraryID: number;
  const items: any[] = [];
  let surname: string;
  let coauthorSurname: string;
  const unsafeTitle =
    '<img id="injected-title" src="x" onerror="alert(1)"> & "literal"';

  async function waitFor(predicate: () => boolean, message: string) {
    const deadline = Date.now() + 10000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(message);
      await Zotero.Promise.delay(50);
    }
  }

  async function makeItem(title: string, firstName: string, date: string) {
    const item = new Zotero.Item("journalArticle");
    item.libraryID = libraryID;
    item.setField("title", title);
    item.setField("date", date);
    item.setField("publicationTitle", "Nature Physics");
    item.setField("volume", "12");
    item.setField("issue", "3");
    item.setCreators([{ firstName, lastName: surname, creatorType: "author" }]);
    await item.saveTx();
    items.push(item);
    return item;
  }

  function result(item: any, authors = [`${surname} Alice`]) {
    return { item, matchedAuthors: authors, affiliations: [] };
  }

  async function clickAndWait(win: Window, id: string) {
    const status = win.document.getElementById("status")!;
    status.textContent = "";
    const button = win.document.getElementById(id) as HTMLButtonElement;
    assert.isFalse(button.disabled, `${id} must be enabled`);
    button.click();
    await waitFor(
      () => !!status.textContent && !button.disabled,
      `${id} did not finish`,
    );
    assert.notEqual(
      status.getAttribute("data-error"),
      "true",
      status.textContent!,
    );
  }

  before(async function () {
    // Fail before any database write if these tests are accidentally loaded elsewhere.
    const dataDir = String(Zotero.DataDirectory.dir).replace(/\\/g, "/");
    assert.match(dataDir, /\/\.scaffold\/test\/data\/?$/);
    surname = `AuthorSearchFixture${Date.now()}`;
    coauthorSurname = `${surname}Coauthor`;
    const api = Zotero.AuthorSearch.api;
    assert.isObject(api);
    factory = api.AuthorSearchFactory;
    mode = api.MatchingMode;
    pane = Zotero.getActiveZoteroPane();
    assert.exists(pane);
    libraryID = Zotero.Libraries.userLibraryID;
    original = await makeItem("Original paper", "Alice", "2022-01-01");
    original.setCreators([
      { firstName: "Alice", lastName: surname, creatorType: "author" },
      { firstName: "Bob", lastName: coauthorSurname, creatorType: "author" },
    ]);
    await original.saveTx();
    exact = await makeItem(unsafeTitle, "Alice", "2025-02-03");
    exact.setCreators(original.getCreators());
    await exact.saveTx();
    initial = await makeItem("Initial match", "A.", "2024-01-01");
    surnameOnly = await makeItem("Surname match", "Charles", "2023-01-01");
    unrelated = await makeItem("Unrelated selection", "David", "2021-01-01");
    unrelated.setCreators([
      {
        firstName: "David",
        lastName: "UnrelatedFixture",
        creatorType: "author",
      },
    ]);
    await unrelated.saveTx();
    deleted = await makeItem("Trashed match", "Alice", "2026-01-01");
    deleted.deleted = true;
    await deleted.saveTx();
  });

  afterEach(async function () {
    const error = this.currentTest?.err;
    if (error) {
      await (window as any).send({
        type: "debug",
        data: {
          title: this.currentTest?.title,
          message: String(error),
          stack: error.stack,
        },
      });
    }
    factory?.closeWindows();
  });

  after(async function () {
    if (!libraryID) return;
    factory?.closeWindows();
    const parent = Zotero.Collections.getByLibrary(libraryID, true).find(
      (collection: any) =>
        collection.name === "@SearchAuthor" && !collection.parentID,
    );
    if (parent) await parent.eraseTx();
    for (const item of items.reverse()) {
      if (Zotero.Items.get(item.id)) await item.eraseTx();
    }
  });

  check(
    "opens the item context menu with three labelled search modes",
    async function () {
      await pane.selectItem(original.id);
      await pane.buildItemContextMenu();
      const popup = pane.document.getElementById("zotero-itemmenu");
      let submenu: any;
      try {
        popup.openPopupAtScreen(120, 120, true);
        await waitFor(
          () =>
            !!popup.querySelector(
              'menu[data-authorsearch-menu="authorsearch"]',
            ),
          "Author Search menu was not registered or labelled",
        );
        const menu = popup.querySelector(
          'menu[data-authorsearch-menu="authorsearch"]',
        );
        assert.isNotEmpty(menu.getAttribute("label"));
        submenu = menu.querySelector("menupopup");
        // Native macOS menus can be built lazily without a DOM popup window.
        submenu.dispatchEvent(
          new (pane.document.defaultView as any).Event("popupshowing", {
            bubbles: true,
          }),
        );
        await waitFor(
          () => submenu.querySelectorAll("menuitem").length === 3,
          "Search mode submenu was not populated",
        );
        const labels = Array.from(submenu.querySelectorAll("menuitem")).map(
          (item: Element) => item.getAttribute("label"),
        );
        assert.isTrue(labels.every((label: string) => !!label?.trim()));
        assert.equal(new Set(labels).size, 3);
      } finally {
        submenu?.hidePopup();
        popup.hidePopup();
      }
    },
  );

  check(
    "keeps strict, flexible and surname matching distinct in the real database",
    async function () {
      const author = original.getCreators()[0];
      const searchIDs = async (matchingMode: string) =>
        (await factory.searchByAuthor(original, author, matchingMode)).map(
          (entry: any) => entry.item.id,
        );
      assert.sameMembers(await searchIDs(mode.Strict), [exact.id]);
      assert.sameMembers(await searchIDs(mode.Flexible), [
        exact.id,
        initial.id,
      ]);
      assert.sameMembers(await searchIDs(mode.Surname), [
        exact.id,
        initial.id,
        surnameOnly.id,
      ]);
      assert.isFalse(
        factory.isAuthorMatch({ lastName: "" }, { lastName: "" }, mode.Surname),
      );
    },
  );

  check(
    "merges multi-author hits into one result without repeating author names",
    async function () {
      const showResults = factory.showResults;
      let captured: any[] | undefined;
      factory.showResults = async (_original: any, results: any[]) => {
        captured = results;
      };
      try {
        await factory.searchAuthors(mode.Strict, { pane, items: [original] });
      } finally {
        factory.showResults = showResults;
      }
      assert.exists(captured);
      assert.lengthOf(captured!, 1);
      assert.equal(captured![0].item.id, exact.id);
      assert.sameMembers(captured![0].matchedAuthors, [
        `${surname} Alice`,
        `${coauthorSurname} Bob`,
      ]);
    },
  );

  check(
    "renders the compact result layout, newest first, and treats titles as text",
    async function () {
      const win = await factory.showResults(
        original,
        [result(initial), result(exact)],
        pane,
      );
      const doc = win.document;
      assert.equal(win.location.href, "about:blank");
      assert.exists(
        doc.querySelector("head style"),
        "CSS must be bundled inline",
      );
      for (const selector of [
        ".results-header",
        ".result-item",
        "#save-collection",
        "#close-results",
      ]) {
        const node = doc.querySelector(selector)!;
        const rect = node.getBoundingClientRect();
        assert.isAbove(rect.width, 10, `${selector} must have visible width`);
        assert.isAbove(rect.height, 10, `${selector} must have visible height`);
        assert.isBelow(
          rect.top,
          win.innerHeight,
          `${selector} must be in the viewport`,
        );
      }
      assert.isAbove(
        doc.querySelector(".results-header")!.getBoundingClientRect().width,
        win.innerWidth - 5,
      );
      const rows = Array.from(doc.querySelectorAll("li.result-item"));
      assert.lengthOf(rows, 2);
      assert.equal((rows[0] as HTMLElement).dataset.itemId, String(exact.id));
      assert.equal(
        rows[0].querySelector(".item-title")!.textContent,
        unsafeTitle,
      );
      assert.isNull(doc.getElementById("injected-title"));
      assert.isNull(rows[0].querySelector("img"));
      assert.equal(
        rows[0].querySelector(".item-publication")!.textContent,
        "Nat. Phys.",
      );
      assert.include(
        rows[0].querySelector(".item-details")!.textContent!,
        "12, 3 (2025)",
      );
      for (const id of [
        "save-collection",
        "copy-results",
        "add-note",
        "close-results",
      ]) {
        assert.isNotEmpty(doc.getElementById(id)!.textContent);
      }
      (rows[0] as HTMLElement).click();
      await waitFor(
        () => pane.getSelectedItems()[0]?.id === exact.id,
        "Result navigation did not select its item",
      );
    },
  );

  check(
    "keeps a large result window populated after asynchronous loading",
    async function () {
      const many = Array.from({ length: 251 }, (_, i) => ({
        item: {
          id: exact.id + i,
          key: exact.key,
          libraryID,
          getField: (field: string) =>
            field === "title" ? `Large result ${i + 1}` : exact.getField(field),
        },
        matchedAuthors: [`${surname} Alice`],
        affiliations: [],
      }));
      const start = Date.now();
      const win = await factory.showResults(original, many, pane);
      await Zotero.Promise.delay(250);
      win.document.title = "Author Search UI verification";
      Zotero.Utilities.Internal.activate(win);
      win.focus();
      await (window as any).send({
        type: "debug",
        data: "Visual QA window is ready: Author Search UI verification",
      });
      await Zotero.Promise.delay(500);
      const { capture } = ChromeUtils.importESModule(
        "chrome://remote/content/shared/Capture.sys.mjs",
      );
      const canvas = await capture.canvas(
        win,
        (win as any).browsingContext,
        0,
        0,
        win.innerWidth,
        win.innerHeight,
        { readback: true },
      );
      const base64 = capture.toBase64(canvas, "image/png");
      const bytes = Uint8Array.from(win.atob(base64), (c) => c.charCodeAt(0));
      const project = PathUtils.parent(
        PathUtils.parent(PathUtils.parent(Zotero.DataDirectory.dir)),
      );
      await IOUtils.write(
        PathUtils.join(project, "dist", "results-1.2.2.png"),
        bytes,
      );
      const rect = win.document
        .querySelector(".result-item")!
        .getBoundingClientRect();
      await (window as any).send({
        type: "debug",
        data: `Visible bounds: ${rect.width} x ${rect.height}; viewport ${win.innerWidth} x ${win.innerHeight}`,
      });
      assert.isAbove(rect.width, 10);
      assert.isAbove(rect.height, 10);
      assert.lengthOf(win.document.querySelectorAll("li.result-item"), 251);
      const title = win.document.querySelector(".item-title")!;
      assert.equal(win.getComputedStyle(title).display, "inline");
      assert.equal(win.getComputedStyle(title).fontSize, "13px");
      assert.exists(win.document.getElementById("status"));
      await (window as any).send({
        type: "debug",
        data: `Packaged XPI: 251 rows remained visible after ${Date.now() - start} ms (including 250 ms stability wait)`,
      });
    },
  );

  check(
    "saves collections and notes to the original item context after selection changes",
    async function () {
      // Deliberately advertise an invalid selected library: actions must use original.libraryID.
      const changedPane = {
        document: pane.document,
        getSelectedItems: () => [unrelated],
        getSelectedLibraryID: () => -999,
        selectItem: (id: number) => pane.selectItem(id),
      };
      const win = await factory.showResults(
        original,
        [result(exact), result(initial)],
        changedPane,
      );
      await pane.selectItem(unrelated.id);
      await clickAndWait(win, "add-note");
      const notes = original.getNotes();
      assert.lengthOf(notes, 1);
      const note = await Zotero.Items.getAsync(notes[0]);
      assert.equal(note.parentID, original.id);
      assert.equal(note.libraryID, original.libraryID);
      assert.lengthOf(unrelated.getNotes(), 0);
      assert.include(note.getNote(), "&lt;img");
      assert.notInclude(note.getNote(), '<img id="injected-title"');

      await clickAndWait(win, "save-collection");
      await clickAndWait(win, "save-collection");
      const collections = Zotero.Collections.getByLibrary(libraryID, true);
      const parents = collections.filter(
        (c: any) => c.name === "@SearchAuthor" && !c.parentID,
      );
      assert.lengthOf(parents, 1);
      const children = collections.filter(
        (c: any) =>
          c.parentID === parents[0].id && c.name === `${surname} Alice`,
      );
      assert.lengthOf(
        children,
        1,
        "Repeated saves must reuse the author collection",
      );
      assert.equal(children[0].libraryID, original.libraryID);
      assert.sameMembers(children[0].getChildItems(true), [
        exact.id,
        initial.id,
      ]);
    },
  );

  check(
    "closes every owned result window and permits opening another window",
    async function () {
      const first = await factory.showResults(original, [result(exact)], pane);
      const second = await factory.showResults(
        original,
        [result(initial)],
        pane,
      );
      factory.closeWindows(pane.document.defaultView);
      await waitFor(
        () => first.closed && second.closed,
        "Owned result windows were not closed",
      );
      const reopened = await factory.showResults(
        original,
        [result(exact)],
        pane,
      );
      assert.isFalse(reopened.closed);
      (
        reopened.document.getElementById("close-results") as HTMLButtonElement
      ).click();
      await waitFor(
        () => reopened.closed,
        "Close button did not close the window",
      );
    },
  );
});
