import { ClipboardHelper } from "zotero-plugin-toolkit";
import { getString } from "../utils/locale";
import { collectAuthorResults } from "./searchEngine";
import {
  createResultsDialog,
  populateResultsDocument,
} from "../utils/resultsWindow";

declare const Zotero: any;
declare const ztoolkit: any;
declare const addon: any;

export enum MatchingMode {
  Strict = "Strict",
  Flexible = "Flexible",
  Surname = "Surname",
}

export interface AuthorSearchResult {
  item: any;
  matchedAuthors: string[];
  affiliations: string[];
}

interface SearchContext {
  pane?: any;
  items?: any[];
}

const HTML_NS = "http://www.w3.org/1999/xhtml";

export class AuthorSearchFactory {
  private static windows = new Map<Window, Window>();
  private static searches = new Map<Window, Set<{ cancelled: boolean }>>();

  static closeWindows(owner?: Window) {
    for (const [win, parent] of this.windows) {
      if (!owner || owner === parent) {
        if (!win.closed) win.close();
        this.windows.delete(win);
      }
    }
    for (const [parent, jobs] of this.searches) {
      if (!owner || owner === parent) {
        for (const job of jobs) job.cancelled = true;
        this.searches.delete(parent);
      }
    }
  }

  static async searchAuthors(
    mode: MatchingMode = MatchingMode.Flexible,
    context: SearchContext = {},
  ) {
    const pane = context.pane || Zotero.getActiveZoteroPane();
    const owner = pane?.document?.defaultView || Zotero.getMainWindow();
    const job = { cancelled: false };
    let progress: any;
    const jobs = this.searches.get(owner) || new Set();
    jobs.add(job);
    this.searches.set(owner, jobs);
    try {
      const selected = context.items || pane?.getSelectedItems();
      if (selected?.length !== 1)
        throw new Error(getString("no-items-selected"));
      const original = selected[0];
      if (!original.isRegularItem()) throw new Error(getString("invalid-item"));
      const creators = original.getCreators();
      if (!creators.length) throw new Error(getString("no-authors-found"));

      // Progress is optional: its availability must not determine whether search works.
      if (typeof Zotero.ProgressWindow === "function") {
        try {
          progress = new Zotero.ProgressWindow({
            window: owner,
            closeOnClick: true,
          });
          progress.changeHeadline(getString("searching"));
          progress.show();
        } catch (error) {
          Zotero.logError(error);
        }
      }
      const results = await collectAuthorResults(original, creators, mode, {
        isCancelled: () => job.cancelled || owner.closed || !addon.data.alive,
        match: (a, b, matchingMode) => this.isAuthorMatch(a, b, matchingMode),
        affiliation: (item, author) => this.extractAffiliation(item, author),
        onProgress: (processed, total) =>
          progress?.changeHeadline(
            `${getString("searching")} ${processed}/${total}`,
          ),
      });
      if (job.cancelled || owner.closed || !addon.data.alive) return;
      progress?.close();
      progress = undefined;
      if (results.length) await this.showResults(original, results, pane);
      else
        Zotero.alert(
          owner,
          getString("search-results-title"),
          getString("no-results-found"),
        );
    } catch (error) {
      Zotero.logError(error);
      if (!job.cancelled && !owner?.closed && addon.data.alive) {
        Zotero.alert(
          owner,
          getString("search-authors-title"),
          String(error.message || error),
        );
      }
    } finally {
      progress?.close();
      jobs.delete(job);
      if (!jobs.size) this.searches.delete(owner);
    }
  }

  private static async searchByAuthor(
    originalItem: any,
    creator: any,
    mode: MatchingMode,
  ): Promise<AuthorSearchResult[]> {
    return collectAuthorResults(originalItem, [creator], mode, {
      match: (a, b, matchingMode) => this.isAuthorMatch(a, b, matchingMode),
      affiliation: (item, author) => this.extractAffiliation(item, author),
    });
  }

  private static async showResults(
    originalItem: any,
    results: AuthorSearchResult[],
    pane: any,
  ): Promise<Window> {
    const owner = pane?.document?.defaultView || Zotero.getMainWindow();
    const dialog = createResultsDialog(
      owner,
      getString("author-search-window-title"),
    );
    const win = dialog.window;
    this.windows.set(win, owner);
    try {
      await dialog.ready;
      populateResultsDocument(win, owner);
      win.addEventListener("unload", () => this.windows.delete(win), {
        once: true,
      });
      await this.renderResults(
        win,
        originalItem,
        this.sortResultsByDate(results),
        pane,
      );
    } catch (error) {
      this.windows.delete(win);
      if (!win.closed) win.close();
      throw error;
    }
    return win;
  }

  private static async renderResults(
    win: Window,
    originalItem: any,
    results: AuthorSearchResult[],
    pane: any,
  ) {
    const doc = win.document;
    doc.title = getString("author-search-window-title");
    doc.documentElement.setAttribute("lang", Zotero.locale || "en");
    doc.getElementById("results-heading")!.textContent =
      `${getString("author-search-window-title")} - ${getString("items-found", { args: { count: results.length } })}`;
    const list = doc.getElementById("results-list")!;
    const element = (tag: string, className: string, text: string) => {
      const node = doc.createElementNS(HTML_NS, tag) as HTMLElement;
      node.className = className;
      node.textContent = text;
      return node;
    };
    const status = (message: string, error = false) => {
      const node = doc.getElementById("status")!;
      node.textContent = message;
      node.setAttribute("data-error", String(error));
    };
    let rendered = 0;
    for (const result of results) {
      if (win.closed || !addon.data.alive) return;
      const row = element("li", "result-item", "");
      row.dataset.itemId = String(result.item.id);
      row.tabIndex = 0;
      const title = result.item.getField("title") || "Untitled";
      row.title = title;
      row.append(
        element("span", "item-title", title),
        doc.createTextNode(" "),
        element("span", "item-authors", result.matchedAuthors.join(", ")),
        doc.createTextNode(" "),
        element("span", "item-publication", this.getPublication(result.item)),
        doc.createTextNode(" "),
      );
      const detail = element("span", "item-details", "");
      const volume = result.item.getField("volume");
      const issue = result.item.getField("issue");
      const year = this.extractYear(result.item.getField("date") || "");
      if (volume) detail.append(element("span", "item-volume", String(volume)));
      detail.append(
        doc.createTextNode(
          `${volume && issue ? `, ${issue}` : ""}${year ? ` (${year})` : ""}`,
        ),
      );
      row.append(detail, doc.createTextNode(" "));
      const uri = this.buildItemSelectURI(result.item);
      const link = element("a", "item-link", "↗") as HTMLAnchorElement;
      link.href = uri;
      link.title = getString("open-item-link");
      link.setAttribute(
        "aria-label",
        `${getString("open-item-link")}: ${title}`,
      );
      row.append(link);
      const select = async () => {
        try {
          const target =
            !win.opener?.closed && pane?.selectItem
              ? pane
              : Zotero.getActiveZoteroPane();
          if (!target?.selectItem)
            throw new Error("Zotero item navigation is unavailable");
          await target.selectItem(result.item.id);
          for (const selected of Array.from(list.querySelectorAll(".selected")))
            (selected as Element).classList.remove("selected");
          row.classList.add("selected");
        } catch (error) {
          Zotero.logError(error);
          status(String(error.message || error), true);
        }
      };
      row.addEventListener("click", (event) => {
        event.preventDefault();
        void select();
      });
      row.addEventListener("keydown", (event: KeyboardEvent) => {
        if (
          event.target === row &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          void select();
        }
      });
      list.append(row);
      if (++rendered % 100 === 0) await Zotero.Promise.delay(0);
    }
    const bindAction = (
      id: string,
      label: any,
      action: () => Promise<string>,
    ) => {
      const button = doc.getElementById(id) as HTMLButtonElement;
      button.textContent = getString(label);
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          status(await action());
        } catch (error) {
          Zotero.logError(error);
          status(String(error.message || error), true);
        } finally {
          if (!win.closed) button.disabled = false;
        }
      });
    };
    bindAction("save-collection", "save-as-collection", async () => {
      await this.saveAsCollection(originalItem, results);
      return getString("collection-saved");
    });
    bindAction("copy-results", "copy-button", async () => {
      new ClipboardHelper()
        .addText(
          results.map((r, i) => `${i + 1}. ${this.plainText(r)}`).join("\n"),
          "text/unicode",
        )
        .addText(this.resultsHtml(results), "text/html")
        .copy();
      return getString("copy-success", { args: { count: results.length } });
    });
    bindAction("add-note", "add-note-button", async () => {
      await this.addNote(originalItem, results);
      return getString("add-note-success", { args: { count: results.length } });
    });
    const close = doc.getElementById("close-results")!;
    close.textContent = getString("close-button");
    close.addEventListener("click", () => win.close());
    doc.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Escape") win.close();
    });
    const library = Zotero.Libraries.get(originalItem.libraryID);
    if (library?.editable === false) {
      for (const id of ["save-collection", "add-note"]) {
        const button = doc.getElementById(id) as HTMLButtonElement;
        button.disabled = true;
        button.title = getString("read-only-library");
      }
    }
  }

  private static assertWritable(originalItem: any) {
    if (Zotero.Libraries.get(originalItem.libraryID)?.editable === false)
      throw new Error(getString("read-only-library"));
    if (originalItem.deleted) throw new Error(getString("invalid-item"));
  }

  private static async saveAsCollection(
    originalItem: any,
    results: AuthorSearchResult[],
  ) {
    this.assertWritable(originalItem);
    const libraryID = originalItem.libraryID;
    if (!results.length) throw new Error(getString("no-results-to-save"));
    if (results.some((r) => r.item.libraryID !== libraryID))
      throw new Error("Results belong to a different library");
    let parent: any;
    const parentPref = `extensions.zotero.authorSearch.parentCollectionKey.${libraryID}`;
    const parentKey = Zotero.Prefs.get(parentPref, true);
    // One transaction prevents half-written collections on failure.
    await Zotero.DB.executeTransaction(async () => {
      const collections =
        Zotero.Collections.getByLibrary(libraryID, true) || [];
      parent =
        collections.find((c) => parentKey && c.key === parentKey) ||
        collections.find((c) => c.name === "@SearchAuthor");
      if (!parent) {
        parent = new Zotero.Collection();
        parent.libraryID = libraryID;
        parent.name = "@SearchAuthor";
        await parent.save();
      }
      const groups = new Map<string, Set<number>>();
      for (const result of results) {
        for (const author of result.matchedAuthors) {
          const ids = groups.get(author) || new Set<number>();
          ids.add(result.item.id);
          groups.set(author, ids);
        }
      }
      for (const [author, ids] of groups) {
        let child = collections.find(
          (c) => c.name === author && c.parentID === parent.id,
        );
        if (!child) {
          child = new Zotero.Collection();
          child.libraryID = libraryID;
          child.parentID = parent.id;
          child.name = author;
          await child.save();
        }
        for (const id of ids) {
          const item = await Zotero.Items.getAsync(id);
          if (!item || item.deleted) continue;
          item.addToCollection(child.id);
          await item.save();
        }
      }
    });
    Zotero.Prefs.set(parentPref, parent.key, true);
  }

  private static async addNote(
    originalItem: any,
    results: AuthorSearchResult[],
  ) {
    this.assertWritable(originalItem);
    const note = new Zotero.Item("note");
    note.libraryID = originalItem.libraryID;
    note.parentID = originalItem.id;
    note.setNote(
      `<h1>${this.escapeHtml(getString("author-search-window-title"))}</h1><p>${this.escapeHtml(originalItem.getField("title"))}</p>${this.resultsHtml(results)}`,
    );
    await note.saveTx();
    return note;
  }

  private static plainText(result: AuthorSearchResult): string {
    return [
      result.item.getField("title"),
      result.matchedAuthors.join(", "),
      this.getPublication(result.item),
      this.extractYear(result.item.getField("date") || ""),
    ]
      .filter(Boolean)
      .join(" - ");
  }

  private static resultsHtml(results: AuthorSearchResult[]): string {
    return `<ol>${results.map((r) => `<li><a href="${this.escapeHtml(this.buildItemSelectURI(r.item))}">↗</a> ${this.escapeHtml(this.plainText(r))}</li>`).join("")}</ol>`;
  }

  private static buildItemSelectURI(item: any): string {
    const library = Zotero.Libraries.get(item.libraryID);
    if (library?.libraryType === "group")
      return `zotero://select/groups/${library.libraryTypeID}/items/${item.key}`;
    return `zotero://select/library/items/${item.key}`;
  }

  private static escapeHtml(value: unknown): string {
    return String(value || "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  }

  private static getPublication(item: any): string {
    return (
      item.getField("journalAbbreviation") ||
      this.getJournalAbbreviation(item.getField("publicationTitle") || "")
    );
  }

  private static extractYear(date: string): string {
    return date.match(/\b(?:18|19|20|21)\d{2}\b/)?.[0] || "";
  }

  private static sortResultsByDate(
    results: AuthorSearchResult[],
  ): AuthorSearchResult[] {
    const rank = (item: any) => {
      const raw = item.getField("date") || "";
      const iso = raw.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
      if (iso)
        return Date.UTC(
          Number(iso[1]),
          Number(iso[2] || 1) - 1,
          Number(iso[3] || 1),
        );
      return Date.parse(raw) || 0;
    };
    return [...results].sort((a, b) => rank(b.item) - rank(a.item));
  }
  private static isAuthorMatch(
    author1: any,
    author2: any,
    mode: MatchingMode,
  ): boolean {
    const lastName1 = (author1.lastName || "").toLowerCase().trim();
    const lastName2 = (author2.lastName || "").toLowerCase().trim();

    if (!lastName1 || !lastName2) return false;
    if (lastName1 !== lastName2) return false;

    if (mode === MatchingMode.Surname) {
      return true;
    }

    const firstName1 = (author1.firstName || "").toLowerCase().trim();
    const firstName2 = (author2.firstName || "").toLowerCase().trim();

    if (mode === MatchingMode.Strict) {
      if (firstName1 && firstName2) {
        return firstName1 === firstName2;
      }
      return firstName1 === firstName2;
    }

    if (firstName1 && firstName2) {
      return (
        firstName1 === firstName2 ||
        firstName1.charAt(0) === firstName2.charAt(0) ||
        firstName1.indexOf(firstName2) === 0 ||
        firstName2.indexOf(firstName1) === 0
      );
    }

    return true;
  }

  /**
   * 从条目中提取机构信息
   */
  private static extractAffiliation(item: any, creator: any): string {
    try {
      const extra = item.getField("extra") as string;
      if (!extra) return "";

      const lines = extra.split("\n");
      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        if (
          lowerLine.indexOf("affiliation") !== -1 ||
          lowerLine.indexOf("institution") !== -1 ||
          lowerLine.indexOf("university") !== -1 ||
          lowerLine.indexOf("institute") !== -1
        ) {
          return line.trim();
        }
      }

      return "";
    } catch (error) {
      return "";
    }
  }

  private static getJournalAbbreviation(fullJournalName: string): string {
    if (!fullJournalName) return "";

    const abbreviations: { [key: string]: string } = {
      // Nature 系列
      Nature: "Nature",
      "Nature Machine Intelligence": "Nat. Mach. Intell.",
      "Nature Communications": "Nat. Commun.",
      "Nature Methods": "Nat. Methods",
      "Nature Biotechnology": "Nat. Biotechnol.",
      "Nature Physics": "Nat. Phys.",
      "Nature Chemistry": "Nat. Chem.",
      "Nature Materials": "Nat. Mater.",
      "Nature Medicine": "Nat. Med.",
      "Nature Genetics": "Nat. Genet.",

      // Science 系列
      Science: "Science",
      "Science Advances": "Sci. Adv.",
      "Science Translational Medicine": "Sci. Transl. Med.",
      "Science Immunology": "Sci. Immunol.",

      // Physical Review 系列
      "Physical Review Letters": "Phys. Rev. Lett.",
      "Physical Review A": "Phys. Rev. A",
      "Physical Review B": "Phys. Rev. B",
      "Physical Review C": "Phys. Rev. C",
      "Physical Review D": "Phys. Rev. D",
      "Physical Review E": "Phys. Rev. E",
      "Physical Review Applied": "Phys. Rev. Appl.",
      "Physical Review Research": "Phys. Rev. Res.",

      // IEEE 系列
      "IEEE Transactions on Pattern Analysis and Machine Intelligence":
        "IEEE Trans. PAMI",
      "IEEE Transactions on Information Theory": "IEEE Trans. Inf. Theory",
      "IEEE Transactions on Signal Processing": "IEEE Trans. Signal Process.",
      "IEEE Transactions on Communications": "IEEE Trans. Commun.",
      "IEEE Transactions on Neural Networks and Learning Systems":
        "IEEE Trans. Neural Netw.",
      "IEEE Transactions on Image Processing": "IEEE Trans. Image Process.",
      "IEEE Transactions on Automatic Control": "IEEE Trans. Autom. Control",
      "IEEE Transactions on Computers": "IEEE Trans. Comput.",
      "IEEE Transactions on Software Engineering": "IEEE Trans. Softw. Eng.",

      // 计算机科学会议
      "Neural Information Processing Systems": "NeurIPS",
      "International Conference on Machine Learning": "ICML",
      "Conference on Computer Vision and Pattern Recognition": "CVPR",
      "International Conference on Computer Vision": "ICCV",
      "European Conference on Computer Vision": "ECCV",
      "Association for Computational Linguistics": "ACL",
      "Conference on Empirical Methods in Natural Language Processing": "EMNLP",
      "North American Chapter of the Association for Computational Linguistics":
        "NAACL",
      "International Conference on Learning Representations": "ICLR",
      "AAAI Conference on Artificial Intelligence": "AAAI",
      "International Joint Conference on Artificial Intelligence": "IJCAI",

      // 生物医学期刊
      Cell: "Cell",
      "The Lancet": "Lancet",
      "New England Journal of Medicine": "N. Engl. J. Med.",
      "Journal of the American Medical Association": "JAMA",
      "Proceedings of the National Academy of Sciences": "PNAS",
      "Nature Reviews Molecular Cell Biology": "Nat. Rev. Mol. Cell Biol.",
      "Nature Reviews Genetics": "Nat. Rev. Genet.",
      "Annual Review of Biochemistry": "Annu. Rev. Biochem.",

      // 化学期刊
      "Journal of the American Chemical Society": "J. Am. Chem. Soc.",
      "Angewandte Chemie International Edition": "Angew. Chem. Int. Ed.",
      "Chemical Reviews": "Chem. Rev.",
      "Accounts of Chemical Research": "Acc. Chem. Res.",
      "Journal of Physical Chemistry": "J. Phys. Chem.",

      // 材料科学
      "Advanced Materials": "Adv. Mater.",
      "Advanced Functional Materials": "Adv. Funct. Mater.",
      "Journal of Materials Chemistry": "J. Mater. Chem.",
      "Chemistry of Materials": "Chem. Mater.",

      // 物理期刊
      "Journal of Physics": "J. Phys.",
      "Applied Physics Letters": "Appl. Phys. Lett.",
      "Review of Scientific Instruments": "Rev. Sci. Instrum.",

      // 数学期刊
      "Journal of Mathematical Physics": "J. Math. Phys.",
      "Communications in Mathematical Physics": "Commun. Math. Phys.",
      "Annals of Mathematics": "Ann. Math.",

      // 其他常见期刊
      "PLoS ONE": "PLoS ONE",
      "Scientific Reports": "Sci. Rep.",
      "Optics Express": "Opt. Express",
      "Optics Letters": "Opt. Lett.",
    };

    // 直接匹配
    if (abbreviations[fullJournalName]) {
      return abbreviations[fullJournalName];
    }

    const exact = Object.entries(abbreviations).find(
      ([name]) => name.toLowerCase() === fullJournalName.toLowerCase(),
    );
    if (exact) return exact[1];

    // 简单自动缩写规则
    return this.autoAbbreviate(fullJournalName);
  }

  /**
   * 自动缩写期刊名称
   */
  private static autoAbbreviate(journalName: string): string {
    if (!journalName) return "";

    // 常见词汇缩写映射
    const wordAbbreviations: { [key: string]: string } = {
      journal: "J.",
      international: "Int.",
      american: "Am.",
      european: "Eur.",
      review: "Rev.",
      reviews: "Rev.",
      proceedings: "Proc.",
      conference: "Conf.",
      transactions: "Trans.",
      communications: "Commun.",
      letters: "Lett.",
      applied: "Appl.",
      theoretical: "Theor.",
      experimental: "Exp.",
      annual: "Annu.",
      advances: "Adv.",
      advanced: "Adv.",
      materials: "Mater.",
      chemistry: "Chem.",
      chemical: "Chem.",
      physics: "Phys.",
      physical: "Phys.",
      biological: "Biol.",
      molecular: "Mol.",
      cellular: "Cell.",
      computational: "Comput.",
      mathematics: "Math.",
      mathematical: "Math.",
      engineering: "Eng.",
      technology: "Technol.",
      science: "Sci.",
      scientific: "Sci.",
      research: "Res.",
      development: "Dev.",
      analysis: "Anal.",
      systems: "Syst.",
      methods: "Methods",
      applications: "Appl.",
      society: "Soc.",
      association: "Assoc.",
      academy: "Acad.",
      university: "Univ.",
    };

    // 分词并缩写
    const words = journalName.split(/\s+/);
    const abbreviated = words.map((word) => {
      const lowerWord = word.toLowerCase().replace(/[^\w]/g, "");
      if (wordAbbreviations[lowerWord]) {
        return wordAbbreviations[lowerWord];
      } else if (word.length > 4) {
        // 长单词保留首字母大写+点
        return word.charAt(0).toUpperCase() + ".";
      }
      return word;
    });

    return abbreviated.join(" ");
  }
}
