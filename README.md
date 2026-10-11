# Zotero Author Search 1.2.2

恢复 V1.1 的紧凑文献列表，在此基础上适配新版 Zotero。插件 ID 保持 `authorsearch@euclpts.com`，安装新版会替换旧版。

## V1.2.2 结果窗口修复

恢复 V1.1 的 `ztoolkit.Dialog` 加载机制：等待 Toolkit 的加载回调，在浏览器创建的现有 head/body 中加入样式和结果，不停止导航或替换整个文档。V1.2.1 的替换方式会使节点存在但实际尺寸为 0×0，导致结果和按钮全部不可见。保留 8 秒加载超时和关闭清理；搜索完成后先关闭 Searching 提示，再展示结果。每 100 行让出事件循环，防止大量结果阻塞界面。

作者搜索由每位作者一次查询、逐条加载，改为一次联合查询、候选去重、每 100 条批量读取。进度显示已处理/候选总数。正在执行的 Zotero 数据库查询本身不能强行中断。

测试先构建生产 XPI，再在隔离配置中实际安装该 XPI 运行；同时检查结果和按钮的可见尺寸，并导出窗口实际绘制的截图 `dist/results-1.2.2.png`。

## 使用与安装

从 [V1.2.2 Release](https://github.com/ustc-iontrap/Zotero-Author-Search/releases/tag/v1.2.2) 下载 `author-search.xpi`，在 Zotero 的插件管理器中选择“从文件安装插件”。覆盖安装后关闭旧结果窗口并重启 Zotero。选中一篇文献，右键“搜索作者”，选择灵活、严格或姓氏匹配。搜索只查该文献所在的库，排除原文献和回收站。

结果按日期倒序，以 V1.1 的行内格式显示标题、匹配作者、期刊和卷期年份；匹配作者为蓝色粗体。点击结果或 ↗ 可定位条目。窗口提供复制、添加原条目子笔记、保存为集合与关闭按钮。集合沿用每库的 `@SearchAuthor` 及作者子集合；会复用旧版保存的父集合 key，即使集合已被移动或改名。

旧版可在 [历史 Releases](https://github.com/ustc-iontrap/Zotero-Author-Search/releases) 查找，使用时请检查对应版本的兼容范围。新版保留了后来增加的复制、笔记与链接功能，并恢复原版列表布局。

## 兼容方式

- Zotero 8 及以后优先采用官方 `Zotero.MenuManager`，不存在或注册失败时使用旧版逐窗口菜单。
- 结果窗口沿用 V1.1 的 Toolkit Dialog 生命周期，将打包进 JavaScript 的 XHTML/CSS 加入现有文档，不需要单独的结果 chrome 页面。
- 每个窗口独立清理，停止插件会关闭结果窗口并取消尚未展示的搜索。
- 捕获搜索源条目，后续切换选择不会改变笔记父条目或保存目标库。
- 文献元数据使用文本节点；写入笔记的 HTML 转义，避免标题被当作界面标记执行。
- `strict_min_version` 为 `7.0`，`strict_max_version` 为 `*`，以后不会仅因主版本号增加而被拒绝加载。未知版本的实际 API 变更仍可能需要适配；这是前向兼容策略，并非对所有未来 Zotero 版本的保证。

官方依据：[Zotero 8 开发说明](https://www.zotero.org/support/dev/zotero_8_for_developers)、[Zotero 9 开发说明](https://www.zotero.org/support/dev/zotero_9_for_developers)。官方建议按已测版本设置上限；本项目按用户要求采用开放上限，并用能力检测和回归测试维护。

自动更新地址指向本项目 GitHub 仓库的 `release` 标签下的 `update.json`。版本安装包以 `author-search.xpi` 为资产名发布到 `v1.2.2` 等版本标签。维护者发布时须同步上传构建生成的更新清单，其下载链接及 SHA512 必须与正式安装包一致。

## 构建与验证

```sh
npm ci
npm run build
npm run test:unit
ZOTERO_PLUGIN_ZOTERO_BIN_PATH=/Applications/Zotero.app/Contents/MacOS/zotero npm test -- --no-watch
```

生产包位于 `.scaffold/build/author-search.xpi`。集成测试使用 `.scaffold/test/profile` 和 `.scaffold/test/data` 的临时配置及数据库，并在写入前检查目录；不读取个人文献库。重复测试会重建测试目录。

`test/authorSearch.test.ts` 覆盖真实菜单、三模式匹配、去重合并、结果窗口、文本安全、条目定位、笔记、集合和窗口清理。`scripts/test-menu.cjs` 使用模拟宿主验证新接口与旧版回退、多窗口和异常清理。真实版本验证结果见 `VALIDATION.md`。
