import { getString } from "../utils/locale";

declare const Zotero: any;
declare const ztoolkit: any;
declare const Services: any;

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

export class AuthorSearchFactory {
  static async searchAuthors(mode: MatchingMode = MatchingMode.Flexible) {
    try {
      ztoolkit.log("=== 开始作者搜索 ===");

      // 1. 获取当前选中的条目
      const pane = Zotero.getActiveZoteroPane();
      const selectedItems = pane.getSelectedItems();

      if (!selectedItems || selectedItems.length !== 1) {
        Zotero.alert(null, "作者搜索", "请选择一个条目进行搜索");
        return;
      }

      const item = selectedItems[0];
      ztoolkit.log("选中的条目:", item.getField("title"));

      // 检查是否是常规条目
      if (!item.isRegularItem()) {
        Zotero.alert(null, "作者搜索", "请选择一个有效的文献条目");
        return;
      }

      // 2. 获取作者列表
      const creators = item.getCreators();
      if (creators.length === 0) {
        Zotero.alert(null, "作者搜索", "该条目没有作者信息");
        return;
      }

      ztoolkit.log(`发现 ${creators.length} 个作者:`, creators);

      // 3. 显示进度窗口
      const progressWin = new ztoolkit.ProgressWindow("搜索作者", {
        closeOnClick: false,
        closeTime: -1,
      });

      const progressLine = progressWin.createLine({
        text: "正在搜索相关作者的文献...",
        type: "default",
        progress: 0,
      });

      progressWin.show();

      // 4. 开始搜索
      const results = [];
      const foundItemIds = [];

      for (let i = 0; i < creators.length; i++) {
        const creator = creators[i];
        progressLine.changeLine({
          text: `搜索作者 ${i + 1}/${creators.length}: ${creator.lastName} ${creator.firstName || ""}`,
          progress: Math.round((i / creators.length) * 100),
        });

        const authorResults = await this.searchByAuthor(item, creator, mode);

        // 合并结果，避免重复
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
        text: `搜索完成！找到 ${results.length} 个相关条目`,
        progress: 100,
      });

      setTimeout(() => progressWin.close(), 2000);

      ztoolkit.log(`=== 搜索完成，共找到 ${results.length} 个结果 ===`);

      // 5. 显示结果
      if (results.length > 0) {
        this.showResults(results);
      } else {
        Zotero.alert(null, "搜索结果", "未找到相关条目");
      }
    } catch (error) {
      ztoolkit.log("搜索过程中发生错误:", error);
      Zotero.alert(null, "错误", `搜索失败: ${error.message}`);
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

      // 创建搜索条件
      const search = new Zotero.Search();
      search.libraryID = originalItem.libraryID;
      search.addCondition("creator", "contains", lastName);

      const itemIds = await search.search();
      ztoolkit.log(`找到 ${itemIds.length} 个可能相关的条目`);

      // 处理搜索结果
      for (const itemId of itemIds) {
        if (itemId === originalItem.id) continue; // 跳过原始条目

        const item = await Zotero.Items.getAsync(itemId);
        if (!item || !item.isRegularItem()) continue;

        const itemCreators = item.getCreators();
        const matchedAuthors = [];
        const affiliations = [];

        // 检查是否有匹配的作者
        for (const itemCreator of itemCreators) {
          if (this.isAuthorMatch(creator, itemCreator, mode)) {
            const authorName =
              `${itemCreator.lastName} ${itemCreator.firstName || ""}`.trim();
            matchedAuthors.push(authorName);

            // 尝试提取机构信息
            const affiliation = this.extractAffiliation(item, itemCreator);
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

  /**
   * 显示搜索结果
   */
  private static showResults(results: AuthorSearchResult[]) {
    ztoolkit.log("准备显示搜索结果");

    // 使用ztoolkit Dialog创建更好的界面
    const dialogHelper = new ztoolkit.Dialog(10, 1)
      .addCell(0, 0, {
        tag: "style",
        properties: {
          innerHTML: `
            .search-results-container {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 0;
              margin: 0;
            }
            .results-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 12px 16px;
              background: #f5f5f5;
              border-bottom: 1px solid #ddd;
              font-weight: bold;
              font-size: 14px;
            }
            .results-list {
              max-height: 400px;
              overflow-y: auto;
              border: 1px solid #ddd;
              background: white;
              padding: 15px;
              list-style: none;
              margin: 0;
            }
            .result-item {
              padding: 8px 0;
              border-bottom: 1px solid #f0f0f0;
              cursor: pointer;
              font-size: 13px;
              line-height: 1.4;
              list-style-type: decimal;
              margin-left: 20px;
            }
            .result-item:hover {
              background: #f8f8f8;
            }
            .result-item:last-child {
              border-bottom: none;
            }
            .item-content {
              display: inline;
            }
            .item-title {
              font-weight: normal;
              color: #333;
              margin-right: 8px;
            }
            .item-authors {
              color: #0066cc;
              font-weight: bold;
              margin-right: 8px;
            }
            .item-publication {
              color: #666;
              font-style: italic;
              margin-right: 8px;
            }
            .item-details {
              color: #888;
              font-size: 12px;
            }
            .item-volume {
              font-weight: bold;
            }
            .dialog-button {
              padding: 6px 16px;
              margin-left: 8px;
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
                properties: {
                  innerHTML: `作者搜索结果 - 找到 ${results.length} 个相关条目`,
                },
              },
              {
                tag: "div",
                children: [
                  {
                    tag: "button",
                    className: "dialog-button primary",
                    properties: {
                      innerHTML: "保存为集合",
                    },
                    listeners: [
                      {
                        type: "click",
                        listener: () => {
                          this.saveAsCollection(results);
                          dialogHelper.window?.close();
                        },
                      },
                    ],
                  },
                  {
                    tag: "button",
                    className: "dialog-button",
                    properties: {
                      innerHTML: "关闭",
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
            id: "results-list",
            children: this.sortResultsByDate(results).map((result, index) => {
              try {
                const title = result.item.getField("title") || "无标题";
                const authors = result.matchedAuthors.join(", ");
                const year = this.extractYear(
                  result.item.getField("date") || "",
                );
                const journal = this.getJournalAbbreviation(
                  result.item.getField("publicationTitle") || "",
                );
                const volume = result.item.getField("volume") || "";
                const issue = result.item.getField("issue") || "";
                const pages = result.item.getField("pages") || "";

                // 构建卷期年份信息
                let detailsInfo = "";
                if (volume) {
                  detailsInfo += `<span class="item-volume">${volume}</span>`;
                  if (issue) {
                    detailsInfo += `, ${issue}`;
                  }
                  if (year) {
                    detailsInfo += ` (${year})`;
                  }
                } else if (year) {
                  detailsInfo = `(${year})`;
                }

                return {
                  tag: "li",
                  className: "result-item",
                  attributes: {
                    "data-item-id": result.item.id.toString(),
                    title: `点击选中条目: ${title}`,
                  },
                  children: [
                    {
                      tag: "span",
                      className: "item-content",
                      properties: {
                        innerHTML: `<span class="item-title">${title}</span> <span class="item-authors">${authors}</span> <span class="item-publication">${journal || ""}</span> <span class="item-details">${detailsInfo || ""}</span>`,
                      },
                    },
                  ],
                };
              } catch (error) {
                ztoolkit.log(`处理第 ${index + 1} 个结果时出错:`, error);
                return {
                  tag: "li",
                  className: "result-item",
                  properties: {
                    innerHTML: `[无法显示条目信息]`,
                  },
                };
              }
            }),
          },
        ],
      })
      .open(
        "作者搜索结果",
        {
          resizable: true,
          centerscreen: true,
        },
        {
          noDialogMode: true,
          styleOptions: {
            width: "800px",
            height: "550px",
          },
        },
      );

    // 添加点击事件
    setTimeout(() => {
      if (dialogHelper.window) {
        const resultItems = dialogHelper.window.document.querySelectorAll(
          ".result-item[data-item-id]",
        );
        resultItems.forEach((item: any) => {
          item.addEventListener("click", () => {
            const itemId = parseInt(item.getAttribute("data-item-id"));
            if (itemId) {
              // 选中条目
              const pane = Zotero.getActiveZoteroPane();
              pane.selectItem(itemId);

              // 高亮选中的行
              resultItems.forEach((r: any) => (r.style.background = ""));
              item.style.background = "#e6f3ff";
            }
          });
        });
      }
    }, 100);
  }

  /**
   * 截断文本
   */
  private static truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text || "";
    return text.substring(0, maxLength - 3) + "...";
  }

  /**
   * 从日期字符串中提取年份
   */
  private static extractYear(dateStr: string): string {
    if (!dateStr) return "";
    const match = dateStr.match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : "";
  }

  /**
   * 保存搜索结果为集合
   */
  private static async saveAsCollection(results: AuthorSearchResult[]) {
    try {
      ztoolkit.log("=== 开始保存集合 ===");

      if (results.length === 0) {
        Zotero.alert(null, "提示", "没有可保存的搜索结果");
        return;
      }

      // 获取原始条目信息用于命名
      const pane = Zotero.getActiveZoteroPane();
      const selectedItems = pane.getSelectedItems();
      let collectionName = `作者搜索结果 (${results.length}条)`;

      if (selectedItems && selectedItems.length > 0) {
        const creators = selectedItems[0].getCreators();
        if (creators.length > 0) {
          const authorNames = creators
            .slice(0, 2)
            .map((c) => c.lastName)
            .join(", ");
          collectionName = `[作者搜索] ${authorNames}${creators.length > 2 ? " 等" : ""} (${results.length}条)`;
        }
      }

      ztoolkit.log("准备创建集合:", collectionName);

      // 获取当前库ID
      const libraryID =
        selectedItems && selectedItems[0]
          ? selectedItems[0].libraryID
          : Zotero.Libraries.userLibraryID;

      ztoolkit.log("使用库ID:", libraryID);

      // 确保@SearchAuthor父集合存在
      const PREF_BASE = "extensions.zotero.authorSearch.parentCollectionKey.";
      let parentKey = Zotero.Prefs.get(`${PREF_BASE}${libraryID}`, true);
      let parentCollection = null;

      if (parentKey) {
        const allCollections =
          Zotero.Collections.getByLibrary(libraryID, true) || [];
        parentCollection =
          allCollections.find((c) => c && c.key === parentKey) || null;
      }

      if (!parentCollection) {
        const allCollections =
          Zotero.Collections.getByLibrary(libraryID, true) || [];
        parentCollection =
          allCollections.find((c) => c && c.name === "@SearchAuthor") || null;
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

      // 按作者分组结果
      const resultsByAuthor = new Map();

      for (const result of results) {
        for (const author of result.matchedAuthors) {
          if (!resultsByAuthor.has(author)) {
            resultsByAuthor.set(author, []);
          }
          resultsByAuthor.get(author).push(result);
        }
      }

      ztoolkit.log("按作者分组，共", resultsByAuthor.size, "个作者");

      const createdCollections = [];

      // 为每个作者创建子集合
      for (const [authorName, authorResults] of resultsByAuthor) {
        ztoolkit.log(`为作者 "${authorName}" 创建集合...`);

        // 检查是否已存在该作者的集合
        const existingCollections =
          Zotero.Collections.getByLibrary(libraryID, true) || [];
        let authorCollection = existingCollections.find(
          (c) =>
            c && c.name === authorName && c.parentID === parentCollection.id,
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

        // 获取该作者的所有条目ID（去重）
        const uniqueItems = new Set();
        for (const result of authorResults) {
          uniqueItems.add(result.item.id);
        }
        const itemIDs = Array.from(uniqueItems);

        ztoolkit.log(`为作者 "${authorName}" 添加 ${itemIDs.length} 个条目`);

        // 添加条目到作者集合
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

      ztoolkit.log("所有作者集合已创建完成");

      // 创建成功消息
      const summary = createdCollections
        .map((c) => `${c.authorName}: ${c.itemCount}个条目`)
        .join("\n");

      Zotero.alert(
        null,
        "保存成功",
        `已在"@SearchAuthor"下创建 ${createdCollections.length} 个作者集合:\n\n${summary}`,
      );

      // 尝试选中父集合
      try {
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
      ztoolkit.log("错误详情:", error.stack);
      Zotero.alert(
        null,
        "保存失败",
        `保存集合时出现错误:\n${error.message}\n\n请查看控制台获取详细信息`,
      );
    }
  }

  /**
   * 按日期倒序排列搜索结果
   */
  private static sortResultsByDate(
    results: AuthorSearchResult[],
  ): AuthorSearchResult[] {
    return results.sort((a, b) => {
      const dateA = this.parseDate(a.item.getField("date") || "");
      const dateB = this.parseDate(b.item.getField("date") || "");

      // 倒序排列 (最新的在前)
      return dateB.getTime() - dateA.getTime();
    });
  }

  /**
   * 解析日期字符串
   */
  private static parseDate(dateStr: string): Date {
    if (!dateStr) return new Date(0); // 没有日期的放到最后

    // 尝试提取年份
    const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[0]);
      // 尝试提取月份
      const monthMatch = dateStr.match(/\b(0?[1-9]|1[0-2])\b/);
      const month = monthMatch ? parseInt(monthMatch[0]) - 1 : 0; // 月份从0开始
      // 尝试提取日期
      const dayMatch = dateStr.match(/\b(0?[1-9]|[12][0-9]|3[01])\b/);
      const day = dayMatch ? parseInt(dayMatch[0]) : 1;

      return new Date(year, month, day);
    }

    // 如果无法解析，尝试直接使用Date构造函数
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date(0) : parsed;
  }

  /**
   * 获取期刊缩写
   */
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

    // 模糊匹配和自动缩写
    const lowerJournal = fullJournalName.toLowerCase();

    // 查找部分匹配
    for (const [full, abbr] of Object.entries(abbreviations)) {
      if (
        lowerJournal.includes(full.toLowerCase()) ||
        full.toLowerCase().includes(lowerJournal)
      ) {
        return abbr;
      }
    }

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
