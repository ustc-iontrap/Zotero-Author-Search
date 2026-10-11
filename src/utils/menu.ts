import { config } from "../../package.json";
import { AuthorSearchFactory, MatchingMode } from "../modules/authorSearch";
import { getString } from "./locale";

declare const Zotero: any;

const menuID = `${config.addonRef}-author-search`;
const menuMarker = "data-authorsearch-menu";
const modes = [
  { mode: MatchingMode.Flexible, label: "search-mode-flexible" },
  { mode: MatchingMode.Strict, label: "search-mode-strict" },
  { mode: MatchingMode.Surname, label: "search-mode-surname" },
] as const;

let registeredID: string | undefined;
let registeredManager: any;
let attemptedOfficialRegistration = false;
const windows = new Set<any>();
const legacyMenus = new Map<any, Element>();

function reportError(error: unknown) {
  Zotero.logError(error);
}

function runSearch(mode: MatchingMode, event: any, context?: any, win?: any) {
  try {
    const sourceWindow =
      win ||
      context?.menuElem?.ownerGlobal ||
      context?.menuElem?.ownerDocument?.defaultView ||
      event?.currentTarget?.ownerDocument?.defaultView ||
      event?.target?.ownerDocument?.defaultView;
    const pane = sourceWindow?.ZoteroPane;
    if (!pane) {
      throw new Error("Author Search: unable to identify the originating pane");
    }
    // Capture selection immediately, before the user can switch windows/items.
    const items = Array.from(context?.items ?? pane.getSelectedItems());
    Promise.resolve(
      AuthorSearchFactory.searchAuthors(mode, { pane, items }),
    ).catch(reportError);
  } catch (error) {
    reportError(error);
  }
}

function setMenuLabel(context: any, label: string) {
  // Zotero 8–10 exposes menuElem; use a setter if later versions provide one.
  if (typeof context.setLabel === "function") {
    context.setLabel(label);
  } else if (context.menuElem) {
    context.menuElem.setAttribute("label", label);
  } else {
    throw new Error("Author Search: menu API did not provide a label target");
  }
  context.menuElem?.setAttribute(menuMarker, config.addonRef);
}

/** Register once with the official API; only older hosts need per-window DOM. */
export function registerAuthorSearchMenu(win: any) {
  windows.add(win);
  if (registeredID) return;

  const manager = Zotero.MenuManager;
  if (
    !attemptedOfficialRegistration &&
    typeof manager?.registerMenu === "function" &&
    typeof manager?.unregisterMenu === "function"
  ) {
    attemptedOfficialRegistration = true;
    try {
      const result = manager.registerMenu({
        menuID,
        pluginID: config.addonID,
        target: "main/library/item",
        menus: [
          {
            menuType: "submenu",
            onShowing: (_event: any, context: any) =>
              setMenuLabel(context, getString("menuitem-label")),
            menus: modes.map(({ mode, label }) => ({
              menuType: "menuitem",
              onShowing: (_event: any, context: any) =>
                setMenuLabel(context, getString(label)),
              onCommand: (event: any, context: any) =>
                runSearch(mode, event, context),
            })),
          },
        ],
      });
      if (typeof result !== "string" || !result) {
        throw new Error("Author Search: official menu registration failed");
      }
      registeredID = result;
      registeredManager = manager;
      return;
    } catch (error) {
      // Preserve a usable entry point if the host rejects the official API.
      reportError(error);
    }
  }

  if (legacyMenus.has(win)) return;
  const doc = win.document;
  const popup = doc.getElementById("zotero-itemmenu");
  if (!popup || typeof doc.createXULElement !== "function") {
    throw new Error("Author Search: library item menu is unavailable");
  }
  const menu = doc.createXULElement("menu");
  menu.id = menuID;
  menu.setAttribute(menuMarker, config.addonRef);
  menu.setAttribute("label", getString("menuitem-label"));
  const subPopup = doc.createXULElement("menupopup");
  for (const { mode, label } of modes) {
    const item = doc.createXULElement("menuitem");
    item.setAttribute("label", getString(label));
    item.addEventListener("command", (event: Event) =>
      runSearch(mode, event, undefined, win),
    );
    subPopup.appendChild(item);
  }
  menu.appendChild(subPopup);
  popup.appendChild(menu);
  legacyMenus.set(win, menu);
}

/** A closing window must not unregister menus in other windows. */
export function unregisterAuthorSearchWindow(win: any) {
  legacyMenus.get(win)?.remove();
  legacyMenus.delete(win);
  windows.delete(win);
}

export function unregisterAuthorSearchMenus() {
  try {
    if (registeredID) {
      if (registeredManager.unregisterMenu(registeredID) === false) {
        reportError(
          new Error("Author Search: official menu unregistration failed"),
        );
      }
    }
  } catch (error) {
    reportError(error);
  } finally {
    registeredID = undefined;
    registeredManager = undefined;
    attemptedOfficialRegistration = false;
    for (const win of windows) {
      try {
        // unregisterMenu updates the next popup; remove visible nodes now too.
        win.document
          .querySelectorAll(`[${menuMarker}="${config.addonRef}"]`)
          .forEach((element: Element) => element.remove());
      } catch (error) {
        reportError(error);
      }
    }
    legacyMenus.clear();
    windows.clear();
  }
}
