import { assert } from "chai";
import { version } from "../package.json";

declare const Zotero: any;
declare const ChromeUtils: any;
declare const PathUtils: any;
declare const Components: any;

// The directory-loaded development add-on does not exercise jar: resource loading.
// Root hook intentionally replaces the development directory before every suite.
// eslint-disable-next-line mocha/no-top-level-hooks
before(async function () {
  this.timeout(30000);
  try {
    assert.match(
      String(Zotero.DataDirectory.dir).replace(/\\/g, "/"),
      /\/\.scaffold\/test\/data\/?$/,
    );
    const { AddonManager } = ChromeUtils.importESModule(
      "resource://gre/modules/AddonManager.sys.mjs",
    );
    const current = await AddonManager.getAddonByID("authorsearch@euclpts.com");
    await current.uninstall();
    const file = Components.classes["@mozilla.org/file/local;1"].createInstance(
      Components.interfaces.nsIFile,
    );
    const project = PathUtils.parent(
      PathUtils.parent(PathUtils.parent(Zotero.DataDirectory.dir)),
    );
    file.initWithPath(
      PathUtils.join(project, "dist", `author-search-${version}.xpi`),
    );
    const install = await AddonManager.getInstallForFile(file);
    await install.install();
    const deadline = Date.now() + 10000;
    while (!Zotero.AuthorSearch?.data.initialized) {
      if (Date.now() > deadline)
        throw new Error("Installed XPI did not initialize");
      await Zotero.Promise.delay(50);
    }
    const installed = await AddonManager.getAddonByID(
      "authorsearch@euclpts.com",
    );
    assert.match(
      installed.getResourceURI("").spec,
      /^jar:/,
      "Tests must run the packaged XPI",
    );
  } catch (error) {
    await (window as any).send({
      type: "debug",
      data: String(error) + "\n" + error?.stack,
    });
    throw error;
  }
});
