import { ClipboardHelper } from "zotero-plugin-toolkit";
import { getString } from "../utils/locale";

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

interface FormattedResult {
  title: string;
  authors: string;
  authorsHtml: string;
  matchedAuthors: string;
  journal: string;
  year: string;
  details: string;
  uri: string;
  plainText: string;
  htmlText: string;
}

export class AuthorSearchFactory {
  static async searchAuthors(mode: MatchingMode = MatchingMode.Flexible) {
    try {
      ztoolkit.log("=== 开始作者搜索 ===");

      const pane = Zotero.getActiveZoteroPane();
      const selectedItems = pane.getSelectedItems();

      if (!selectedItems || selectedItems.length !== 1) {
        Zotero.alert(
          null,
          getString("search-authors-title"),
          getString("no-items-selected"),
        );
        return;
      }

      const item = selectedItems[0];
      ztoolkit.log("选中的条目:", item.getField("title"));

      if (!item.isRegularItem()) {
        Zotero.alert(
          null,
          getString("search-authors-title"),
          getString("invalid-item"),
        );
        return;
      }

      const creators = item.getCreators();
      if (creators.length === 0) {
        Zotero.alert(
          null,
          getString("search-authors-title"),
          getString("no-authors-found"),
        );
        return;
      }

      ztoolkit.log(`发现 ${creators.length} 个作者:`, creators);

      const progressWin = new ztoolkit.ProgressWindow(
        getString("search-authors-title"),
        {
          closeOnClick: false,
          closeTime: -1,
        },
      );

      const progressLine = progressWin.createLine({
        text: getString("searching"),
        type: "default",
        progress: 0,
      });

      progressWin.show();

      const results: AuthorSearchResult[] = [];
      const foundItemIds: number[] = [];

      for (let i = 0; i < creators.length; i++) {
        const creator = creators[i];
        progressLine.changeLine({
          text: `搜索作者 ${i + 1}/${creators.length}: ${creator.lastName} ${creator.firstName || ""}`,
          progress: Math.round((i / creators.length) * 100),
        });

        const authorResults = await this.searchByAuthor(item, creator, mode);

        for (const result of authorResults) {
          if (foundItemIds.indexOf(result.item.id) === -1) {
            foundItemIds.push(result.item.id);
            results.push(result);
          }
        }

        ztoolkit.log(
          `作者 ${creator.lastName} 找到 ${authorResults.length} 个结果`,
        );
      }

      progressLine.changeLine({
        text: `${getString("search-complete")}！${getString("items-found", {
          args: { count: results.length },
        })}`,
        progress: 100,
      });

      setTimeout(() => progressWin.close(), 2000);

      ztoolkit.log(`=== 搜索完成，共找到 ${results.length} 个结果 ===`);

      if (results.length > 0) {
        this.showResults(item, results);
      } else {
        Zotero.alert(
          null,
          getString("search-results-title"),
          getString("no-results-found"),
        );
      }
    } catch (error) {
      ztoolkit.log("搜索过程中发生错误:", error);
      Zotero.alert(
        null,
        "错误",
        `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private static async searchByAuthor(
    originalItem: any,
    creator: any,
    mode: MatchingMode,
  ): Promise<AuthorSearchResult[]> {
    const results: AuthorSearchResult[] = [];

    try {
      const lastName = creator.lastName || "";
      if (!lastName) return results;

      ztoolkit.log(`开始搜索作者: ${lastName} ${creator.firstName || ""}`);

      const search = new Zotero.Search();
      search.libraryID = originalItem.libraryID;
      search.addCondition("creator", "contains", lastName);

      const itemIds = await search.search();
      ztoolkit.log(`找到 ${itemIds.length} 个可能相关的条目`);

      for (const itemId of itemIds) {
        if (itemId === originalItem.id) continue;

        const item = await Zotero.Items.getAsync(itemId);
        if (!item || !item.isRegularItem()) continue;

        const itemCreators = item.getCreators();
        const matchedAuthors: string[] = [];
        const affiliations: string[] = [];

        for (const itemCreator of itemCreators) {
          if (this.isAuthorMatch(creator, itemCreator, mode)) {
            const authorName =
              `${itemCreator.lastName} ${itemCreator.firstName || ""}`.trim();
            matchedAuthors.push(authorName);

            const affiliation = this.extractAffiliation(item);
            if (affiliation) {
              affiliations.push(affiliation);
            }
          }
        }

        if (matchedAuthors.length > 0) {
          results.push({
            item,
            matchedAuthors,
            affiliations,
          });
        }
      }
    } catch (error) {
      ztoolkit.log("搜索单个作者时出错:", error);
    }

    return results;
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

  private static extractAffiliation(item: any): string {
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
    } catch (_error) {
      ztoolkit.log("提取机构信息失败");
    }

    return "";
  }

  private static showResults(originalItem: any, results: AuthorSearchResult[]) {
    ztoolkit.log("准备显示搜索结果");

    addon.data.dialog?.window?.close();

    const sortedResults = this.sortResultsByDate([...results]);
    const formattedResults = sortedResults.map((result) =>
      this.formatResult(result),
    );

    const dialogHelper = new ztoolkit.Dialog(10, 1)
      .addCell(0, 0, {
        tag: "style",
        properties: {
          innerHTML: `
            .search-results-container {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              padding: 0;
              margin: 0;
              height: 100%;
              display: flex;
              flex-direction: column;
            }
            .results-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 16px;
              padding: 12px 16px;
              background: #f5f5f5;
              border-bottom: 1px solid #ddd;
              font-size: 14px;
            }
            .results-header-title {
              font-weight: 600;
            }
            .header-actions {
              display: flex;
              flex-wrap: wrap;
              justify-content: flex-end;
              gap: 12px;
            }
            .results-list {
              flex: 1;
              max-height: 400px;
              overflow-y: auto;
              border: 1px solid #ddd;
              background: white;
              padding: 15px;
              list-style: none;
              margin: 0;
            }
            .result-item {
              padding: 10px 0;
              border-bottom: 1px solid #f0f0f0;
              cursor: pointer;
              font-size: 13px;
              line-height: 1.5;
              list-style-type: decimal;
              margin-left: 20px;
            }
            .result-item:hover {
              background: #f8f8f8;
            }
            .result-item:last-child {
              border-bottom: none;
            }
            .result-main {
              display: inline;
              white-space: normal;
              overflow-wrap: anywhere;
            }
            .item-title {
              color: #1f2328;
              font-weight: 500;
            }
            .item-authors {
              color: #4b5563;
            }
            .item-author-highlight {
              color: #0969da;
              font-weight: 600;
            }
            .item-publication {
              color: #5f6b7a;
              font-style: italic;
            }
            .item-details {
              color: #4b5563;
              font-size: 12px;
            }
            .item-volume {
              font-weight: 600;
            }
            .item-link {
              display: inline-block;
              color: #0969da;
              text-decoration: none;
              font-size: 14px;
              line-height: 1;
              opacity: 0.9;
              margin-left: 6px;
              vertical-align: baseline;
            }
            .item-separator {
              color: #666;
            }
            .result-item:hover .item-link {
              opacity: 1;
            }
            .dialog-button {
              padding: 6px 16px;
              border: 1px solid #ccc;
              background: #fff;
              cursor: pointer;
              border-radius: 3px;
              font-size: 12px;
            }
            .dialog-button:hover {
              background: #f0f0f0;
            }
            .dialog-button.primary {
              background: #0066cc;
              color: white;
              border-color: #0066cc;
            }
            .dialog-button.primary:hover {
              background: #0052a3;
            }
          `,
        },
      })
      .addCell(1, 0, {
        tag: "div",
        className: "search-results-container",
        children: [
          {
            tag: "div",
            className: "results-header",
            children: [
              {
                tag: "span",
                className: "results-header-title",
                properties: {
                  textContent: `${getString("search-results-title")} - ${getString("items-found", {
                    args: { count: formattedResults.length },
                  })}`,
                },
              },
              {
                tag: "div",
                className: "header-actions",
                children: [
                  {
                    tag: "button",
                    className: "dialog-button",
                    properties: {
                      innerHTML: getString("copy-button"),
                    },
                    listeners: [
                      {
                        type: "click",
                        listener: () => {
                          void this.copyResultsToClipboard(formattedResults);
                        },
                      },
                    ],
                  },
                  {
                    tag: "button",
                    className: "dialog-button",
                    properties: {
                      innerHTML: getString("add-note-button"),
                    },
                    listeners: [
                      {
                        type: "click",
                        listener: () => {
                          void this.addNote(originalItem, formattedResults);
                        },
                      },
                    ],
                  },
                  {
                    tag: "button",
                    className: "dialog-button primary",
                    properties: {
                      innerHTML: getString("save-as-collection"),
                    },
                    listeners: [
                      {
                        type: "click",
                        listener: () => {
                          void this.saveAsCollection(originalItem, sortedResults);
                          dialogHelper.window?.close();
                        },
                      },
                    ],
                  },
                  {
                    tag: "button",
                    className: "dialog-button",
                    properties: {
                      innerHTML: getString("close-button"),
                    },
                    listeners: [
                      {
                        type: "click",
                        listener: () => dialogHelper.window?.close(),
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            tag: "ol",
            className: "results-list",
            children: formattedResults.map((formattedResult, index) => {
              const result = sortedResults[index];
              const hasPublication = Boolean(formattedResult.journal);
              const hasDetails = Boolean(formattedResult.details);
              const hasPublicationInfo = hasPublication || hasDetails;
              const hasAuthors = Boolean(formattedResult.authorsHtml);
              const resultMainChildren: any[] = [];

              if (formattedResult.title) {
                resultMainChildren.push({
                  tag: "span",
                  className: "item-title",
                  properties: {
                    textContent: formattedResult.title,
                  },
                });
              }

              if (hasAuthors) {
                if (resultMainChildren.length > 0) {
                  resultMainChildren.push({
                    tag: "span",
                    className: "item-separator",
                    properties: {
                      textContent: ". ",
                    },
                  });
                }

                resultMainChildren.push({
                  tag: "span",
                  className: "item-authors",
                  properties: {
                    innerHTML: formattedResult.authorsHtml,
                  },
                });
              }

              if (hasPublicationInfo) {
                resultMainChildren.push({
                  tag: "span",
                  className: "item-separator",
                  properties: {
                    textContent: ". ",
                  },
                });
              }

              if (hasPublication) {
                resultMainChildren.push({
                  tag: "span",
                  className: "item-publication",
                  properties: {
                    textContent: formattedResult.journal,
                  },
                });
              }

              if (hasPublication && hasDetails) {
                resultMainChildren.push({
                  tag: "span",
                  className: "item-separator",
                  properties: {
                    textContent: " ",
                  },
                });
              }

              if (hasDetails) {
                resultMainChildren.push({
                  tag: "span",
                  className: "item-details",
                  properties: {
                    innerHTML: formattedResult.details,
                  },
                });
              }

              resultMainChildren.push({
                tag: "a",
                className: "item-link",
                properties: {
                  href: formattedResult.uri,
                  textContent: "↗",
                },
                attributes: {
                  title: `${getString("open-item-link")}: ${formattedResult.title}`,
                },
                listeners: [
                  {
                    type: "click",
                    listener: (event: Event) => event.stopPropagation(),
                  },
                ],
              });

              return {
                tag: "li",
                className: "result-item",
                attributes: {
                  "data-item-id": result.item.id.toString(),
                  title: `${getString("open-item-link")}: ${formattedResult.title}`,
                },
                children: [
                  {
                    tag: "span",
                    className: "result-main",
                    children: resultMainChildren,
                  },
                ],
              };
            }),
          },
        ],
      })
      .open(
        getString("author-search-window-title"),
        {
          resizable: true,
          centerscreen: true,
          noDialogMode: true,
          width: 860,
          height: 560,
        },
      );

    addon.data.dialog = dialogHelper;

    setTimeout(() => {
      if (!dialogHelper.window) {
        return;
      }

      const resultItems = dialogHelper.window.document.querySelectorAll(
        ".result-item[data-item-id]",
      );

      resultItems.forEach((item: any) => {
        item.addEventListener("click", () => {
          const itemId = parseInt(item.getAttribute("data-item-id"), 10);
          if (!itemId) {
            return;
          }

          const pane = Zotero.getActiveZoteroPane();
          pane.selectItem(itemId);

          resultItems.forEach((row: any) => (row.style.background = ""));
          item.style.background = "#e6f3ff";
        });
      });
    }, 100);
  }

  private static async copyResultsToClipboard(results: FormattedResult[]) {
    if (!results.length) {
      Zotero.alert(
        null,
        getString("copy-button"),
        getString("no-results-to-save"),
      );
      return;
    }

    try {
      const plainText = results
        .map((result, index) => `${index + 1}. ${result.plainText}`)
        .join("\n");
      const html = `<ol>${results
        .map((result) => `<li>${result.htmlText}</li>`)
        .join("")}</ol>`;

      new ClipboardHelper()
        .addText(plainText, "text/unicode")
        .addText(html, "text/html")
        .copy();

      Zotero.alert(
        null,
        getString("copy-button"),
        getString("copy-success", { args: { count: results.length } }),
      );
    } catch (error) {
      ztoolkit.log("复制到剪贴板失败:", error);
      Zotero.alert(
        null,
        getString("copy-button"),
        getString("copy-error"),
      );
    }
  }

  private static async addNote(originalItem: any, results: FormattedResult[]) {
    if (!results.length) {
      Zotero.alert(
        null,
        getString("add-note-button"),
        getString("no-results-to-save"),
      );
      return;
    }

    try {
      const note = new Zotero.Item("note");
      note.libraryID = originalItem.libraryID;
      note.parentID = originalItem.id;
      note.setNote(this.buildNoteHtml(originalItem, results));
      await note.saveTx();

      Zotero.alert(
        null,
        getString("add-note-button"),
        getString("add-note-success", { args: { count: results.length } }),
      );
    } catch (error) {
      ztoolkit.log("创建笔记失败:", error);
      Zotero.alert(
        null,
        getString("add-note-button"),
        getString("add-note-error"),
      );
    }
  }

  private static buildNoteHtml(
    originalItem: any,
    results: FormattedResult[],
  ): string {
    const sourceTitle = this.escapeHtml(
      originalItem.getField("title") || "Untitled",
    );
    const now = new Date().toLocaleString();

    return `
      <h1>${this.escapeHtml(getString("author-search-window-title"))}</h1>
      <p><strong>${this.escapeHtml(getString("title-column"))}:</strong> ${sourceTitle}</p>
      <p><strong>Date:</strong> ${this.escapeHtml(now)}</p>
      <ol>
        ${results.map((result) => `<li>${result.htmlText}</li>`).join("")}
      </ol>
    `.trim();
  }

  private static formatResult(result: AuthorSearchResult): FormattedResult {
    const title = result.item.getField("title") || "无标题";
    const authors =
      this.getItemAuthors(result.item) || result.matchedAuthors.join(", ");
    const authorsHtml = this.getItemAuthorsHtml(
      result.item,
      result.matchedAuthors,
    );
    const matchedAuthors = result.matchedAuthors.join(", ");
    const year = this.extractYear(result.item.getField("date") || "");
    const journal = this.getDisplayPublication(result.item);
    const details = this.buildDetailsInfo(result.item, year);
    const uri = this.buildItemSelectURI(result.item);
    const plainText = [title, authors, journal, year].filter(Boolean).join(" - ");
    const htmlParts = [
      `<a href="${this.escapeHtml(uri)}">↗</a>`,
      `<strong>${this.escapeHtml(title)}</strong>`,
      authors ? this.escapeHtml(authors) : "",
      journal ? `<em>${this.escapeHtml(journal)}</em>` : "",
      year ? `(${this.escapeHtml(year)})` : "",
    ].filter(Boolean);

    return {
      title,
      authors,
      authorsHtml,
      matchedAuthors,
      journal,
      year,
      details,
      uri,
      plainText,
      htmlText: htmlParts.join(" - "),
    };
  }

  private static buildItemSelectURI(item: any): string {
    const library = Zotero.Libraries.get(item.libraryID);

    if (library?.libraryType === "user") {
      return `zotero://select/library/items/${item.key}`;
    }

    if (library?.libraryType === "group") {
      return `zotero://select/groups/${library.libraryTypeID}/items/${item.key}`;
    }

    return `zotero://select/${Zotero.URI.getItemPath(item)}`;
  }

  private static getItemAuthors(item: any): string {
    const creators = item.getCreators().filter((creator: any) => creator);
    return creators
      .map((creator: any) => this.formatCreatorName(creator))
      .filter(Boolean)
      .join(", ");
  }

  private static getItemAuthorsHtml(
    item: any,
    matchedAuthors: string[],
  ): string {
    const matchedNames = new Set(
      matchedAuthors.map((author) => this.normalizeAuthorName(author)),
    );

    return item
      .getCreators()
      .filter((creator: any) => creator)
      .map((creator: any) => {
        const name = this.formatCreatorName(creator);
        if (!name) {
          return "";
        }

        const escapedName = this.escapeHtml(name);
        if (matchedNames.has(this.normalizeAuthorName(name))) {
          return `<span class="item-author-highlight">${escapedName}</span>`;
        }
        return escapedName;
      })
      .filter(Boolean)
      .join(", ");
  }

  private static formatCreatorName(creator: any): string {
    if (creator.name) {
      return creator.name;
    }

    return `${creator.lastName || ""} ${creator.firstName || ""}`.trim();
  }

  private static normalizeAuthorName(name: string): string {
    return name.toLowerCase().replace(/\s+/g, " ").trim();
  }

  private static getDisplayPublication(item: any): string {
    return this.getJournalAbbreviation(
      item.getField("publicationTitle") ||
        item.getField("proceedingsTitle") ||
        item.getField("bookTitle") ||
        "",
    );
  }

  private static buildDetailsInfo(item: any, year: string): string {
    const volume = item.getField("volume") || "";
    const issue = item.getField("issue") || "";

    if (volume) {
      let detailsInfo = `<span class="item-volume">${this.escapeHtml(volume)}</span>`;
      if (issue) {
        detailsInfo += `, ${this.escapeHtml(issue)}`;
      }
      if (year) {
        detailsInfo += ` (${this.escapeHtml(year)})`;
      }
      return detailsInfo;
    }

    if (year) {
      return `(${this.escapeHtml(year)})`;
    }

    return "";
  }

  private static escapeHtml(text: string): string {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private static extractYear(dateStr: string): string {
    if (!dateStr) return "";
    const match = dateStr.match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : "";
  }

  private static async saveAsCollection(
    originalItem: any,
    results: AuthorSearchResult[],
  ) {
    try {
      ztoolkit.log("=== 开始保存集合 ===");

      if (results.length === 0) {
        Zotero.alert(
          null,
          getString("save-as-collection"),
          getString("no-results-to-save"),
        );
        return;
      }

      let collectionName = `作者搜索结果 (${results.length}条)`;
      const creators = originalItem.getCreators();
      if (creators.length > 0) {
        const authorNames = creators
          .slice(0, 2)
          .map((creator: any) => creator.lastName || creator.name)
          .filter(Boolean)
          .join(", ");
        collectionName = `[作者搜索] ${authorNames}${creators.length > 2 ? " 等" : ""} (${results.length}条)`;
      }

      ztoolkit.log("准备创建集合:", collectionName);

      const libraryID = originalItem.libraryID || Zotero.Libraries.userLibraryID;
      ztoolkit.log("使用库ID:", libraryID);

      const PREF_BASE = "extensions.zotero.authorSearch.parentCollectionKey.";
      let parentKey = Zotero.Prefs.get(`${PREF_BASE}${libraryID}`, true);
      let parentCollection = null;

      if (parentKey) {
        const allCollections =
          Zotero.Collections.getByLibrary(libraryID, true) || [];
        parentCollection =
          allCollections.find((collection: any) => collection?.key === parentKey) ||
          null;
      }

      if (!parentCollection) {
        const allCollections =
          Zotero.Collections.getByLibrary(libraryID, true) || [];
        parentCollection =
          allCollections.find(
            (collection: any) => collection && collection.name === "@SearchAuthor",
          ) || null;
      }

      if (!parentCollection) {
        parentCollection = new Zotero.Collection();
        parentCollection.name = "@SearchAuthor";
        parentCollection.libraryID = libraryID;
        await parentCollection.saveTx();
        Zotero.Prefs.set(
          `${PREF_BASE}${libraryID}`,
          parentCollection.key,
          true,
        );
        ztoolkit.log("已创建@SearchAuthor父集合，ID:", parentCollection.id);
      }

      const resultsByAuthor = new Map<string, AuthorSearchResult[]>();
      for (const result of results) {
        for (const author of result.matchedAuthors) {
          if (!resultsByAuthor.has(author)) {
            resultsByAuthor.set(author, []);
          }
          resultsByAuthor.get(author)?.push(result);
        }
      }

      ztoolkit.log("按作者分组，共", resultsByAuthor.size, "个作者");

      const createdCollections: Array<{
        authorName: string;
        collectionID: number;
        itemCount: number;
      }> = [];

      for (const [authorName, authorResults] of resultsByAuthor) {
        ztoolkit.log(`为作者 "${authorName}" 创建集合...`);

        const existingCollections =
          Zotero.Collections.getByLibrary(libraryID, true) || [];
        let authorCollection = existingCollections.find(
          (collection: any) =>
            collection &&
            collection.name === authorName &&
            collection.parentID === parentCollection.id,
        );

        if (!authorCollection) {
          authorCollection = new Zotero.Collection();
          authorCollection.name = authorName;
          authorCollection.libraryID = libraryID;
          authorCollection.parentID = parentCollection.id;
          await authorCollection.saveTx();
          ztoolkit.log(
            `已创建作者集合 "${authorName}"，ID:`,
            authorCollection.id,
          );
        } else {
          ztoolkit.log(
            `使用现有作者集合 "${authorName}"，ID:`,
            authorCollection.id,
          );
        }

        const uniqueItems = new Set<number>();
        for (const result of authorResults) {
          uniqueItems.add(result.item.id);
        }
        const itemIDs = Array.from(uniqueItems);

        ztoolkit.log(`为作者 "${authorName}" 添加 ${itemIDs.length} 个条目`);

        for (const itemID of itemIDs) {
          const item = await Zotero.Items.getAsync(itemID);
          if (item) {
            item.addToCollection(authorCollection.id);
            await item.saveTx();
          }
        }

        createdCollections.push({
          authorName,
          collectionID: authorCollection.id,
          itemCount: itemIDs.length,
        });
      }

      const summary = createdCollections
        .map((collection) => `${collection.authorName}: ${collection.itemCount}个条目`)
        .join("\n");

      Zotero.alert(
        null,
        getString("collection-saved"),
        `已在"@SearchAuthor"下创建 ${createdCollections.length} 个作者集合:\n\n${summary}`,
      );

      try {
        const pane = Zotero.getActiveZoteroPane();
        setTimeout(() => {
          pane.collectionsView.selectCollection(parentCollection.id);
          ztoolkit.log("已选中@SearchAuthor父集合");
        }, 1000);
      } catch (error) {
        ztoolkit.log("选中集合失败，但集合已成功创建:", error);
      }

      ztoolkit.log("=== 集合保存完成 ===");
    } catch (error) {
      ztoolkit.log("保存集合时发生错误:", error);
      Zotero.alert(
        null,
        getString("save-as-collection"),
        `${getString("save-collection-error")}\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private static sortResultsByDate(
    results: AuthorSearchResult[],
  ): AuthorSearchResult[] {
    return results.sort((a, b) => {
      const dateA = this.parseDate(a.item.getField("date") || "");
      const dateB = this.parseDate(b.item.getField("date") || "");
      return dateB.getTime() - dateA.getTime();
    });
  }

  private static parseDate(dateStr: string): Date {
    if (!dateStr) return new Date(0);

    const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[0], 10);
      const monthMatch = dateStr.match(/\b(0?[1-9]|1[0-2])\b/);
      const month = monthMatch ? parseInt(monthMatch[0], 10) - 1 : 0;
      const dayMatch = dateStr.match(/\b(0?[1-9]|[12][0-9]|3[01])\b/);
      const day = dayMatch ? parseInt(dayMatch[0], 10) : 1;

      return new Date(year, month, day);
    }

    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date(0) : parsed;
  }

  private static getJournalAbbreviation(fullJournalName: string): string {
    if (!fullJournalName) return "";

    const abbreviations: { [key: string]: string } = {
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
      Science: "Science",
      "Science Advances": "Sci. Adv.",
      "Science Translational Medicine": "Sci. Transl. Med.",
      "Science Immunology": "Sci. Immunol.",
      "Physical Review Letters": "Phys. Rev. Lett.",
      "Physical Review A": "Phys. Rev. A",
      "Physical Review B": "Phys. Rev. B",
      "Physical Review C": "Phys. Rev. C",
      "Physical Review D": "Phys. Rev. D",
      "Physical Review E": "Phys. Rev. E",
      "Physical Review Applied": "Phys. Rev. Appl.",
      "Physical Review Research": "Phys. Rev. Res.",
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
      Cell: "Cell",
      "The Lancet": "Lancet",
      "New England Journal of Medicine": "N. Engl. J. Med.",
      "Journal of the American Medical Association": "JAMA",
      "Proceedings of the National Academy of Sciences": "PNAS",
      "Nature Reviews Molecular Cell Biology": "Nat. Rev. Mol. Cell Biol.",
      "Nature Reviews Genetics": "Nat. Rev. Genet.",
      "Annual Review of Biochemistry": "Annu. Rev. Biochem.",
      "Journal of the American Chemical Society": "J. Am. Chem. Soc.",
      "Angewandte Chemie International Edition": "Angew. Chem. Int. Ed.",
      "Chemical Reviews": "Chem. Rev.",
      "Accounts of Chemical Research": "Acc. Chem. Res.",
      "Journal of Physical Chemistry": "J. Phys. Chem.",
      "Advanced Materials": "Adv. Mater.",
      "Advanced Functional Materials": "Adv. Funct. Mater.",
      "Journal of Materials Chemistry": "J. Mater. Chem.",
      "Chemistry of Materials": "Chem. Mater.",
      "Journal of Physics": "J. Phys.",
      "Applied Physics Letters": "Appl. Phys. Lett.",
      "Review of Scientific Instruments": "Rev. Sci. Instrum.",
      "Journal of Mathematical Physics": "J. Math. Phys.",
      "Communications in Mathematical Physics": "Commun. Math. Phys.",
      "Annals of Mathematics": "Ann. Math.",
      "PLoS ONE": "PLoS ONE",
      "Scientific Reports": "Sci. Rep.",
      "Optics Express": "Opt. Express",
      "Optics Letters": "Opt. Lett.",
    };

    if (abbreviations[fullJournalName]) {
      return abbreviations[fullJournalName];
    }

    const lowerJournal = fullJournalName.toLowerCase();
    for (const [full, abbr] of Object.entries(abbreviations)) {
      if (
        lowerJournal.includes(full.toLowerCase()) ||
        full.toLowerCase().includes(lowerJournal)
      ) {
        return abbr;
      }
    }

    return this.autoAbbreviate(fullJournalName);
  }

  private static autoAbbreviate(journalName: string): string {
    if (!journalName) return "";

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

    const words = journalName.split(/\s+/);
    const abbreviated = words.map((word) => {
      const lowerWord = word.toLowerCase().replace(/[^\w]/g, "");
      if (wordAbbreviations[lowerWord]) {
        return wordAbbreviations[lowerWord];
      }
      if (word.length > 4) {
        return `${word.charAt(0).toUpperCase()}.`;
      }
      return word;
    });

    return abbreviated.join(" ");
  }
}
