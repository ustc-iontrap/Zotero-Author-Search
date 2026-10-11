import { AuthorSearchFactory } from "./modules/authorSearch";
import { initLocale } from "./utils/locale";
import {
  registerAuthorSearchMenu,
  unregisterAuthorSearchMenus,
  unregisterAuthorSearchWindow,
} from "./utils/menu";

declare const Zotero: any;
declare const ztoolkit: any;
declare const addon: any;

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  if (!addon.data.alive) return;

  initLocale();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Mark initialized as true to confirm plugin loading status
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: any): Promise<void> {
  if (!addon.data.alive || win.closed) return;
  registerAuthorSearchMenu(win);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  try {
    unregisterAuthorSearchWindow(win);
  } finally {
    AuthorSearchFactory.closeWindows(win);
  }
}

function onShutdown(): void {
  // Stop pending searches from creating UI while the add-on is unloading.
  addon.data.alive = false;
  try {
    unregisterAuthorSearchMenus();
  } finally {
    try {
      AuthorSearchFactory.closeWindows();
    } finally {
      try {
        ztoolkit.unregisterAll();
      } finally {
        delete Zotero[addon.data.config.addonInstance];
      }
    }
  }
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  // You can add your code to the corresponding notify type
  ztoolkit.log("notify", event, type, ids, extraData);
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      // registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

function onShortcuts(type: string) {
  switch (type) {
    default:
      break;
  }
}

function onDialogEvents(type: string) {
  switch (type) {
    case "authorSearch":
      AuthorSearchFactory.searchAuthors();
      break;
    default:
      break;
  }
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
