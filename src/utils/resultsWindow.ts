import template from "../../addon/content/results.xhtml";
import stylesheet from "../../addon/content/results.css";

declare const ztoolkit: any;

/** Bound the Toolkit load callback, including a close before the callback fires. */
export function waitForDialogLoad(
  win: Window,
  owner: Window,
  loaded: Promise<void>,
  timeout = 8000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    let timer: number;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      owner.clearTimeout(timer);
      owner.removeEventListener("unload", cancelled);
      if (error) reject(error);
      else resolve();
    };
    const cancelled = () =>
      finish(new Error("Author Search window was closed"));
    const check = () => {
      if (win.closed || owner.closed) return cancelled();
      if (Date.now() >= deadline) {
        finish(
          new Error(
            "Author Search results window could not load within 8 seconds. Please reopen the search.",
          ),
        );
      } else timer = owner.setTimeout(check, 50);
    };
    owner.addEventListener("unload", cancelled, { once: true });
    loaded.then(() => {
      if (win.closed || owner.closed) cancelled();
      else finish();
    }, finish);
    check();
  });
}

/** Use V1.1's Dialog lifecycle; keep the browser-created document and body alive. */
export function createResultsDialog(owner: Window, title: string) {
  let complete: () => void;
  const loaded = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const dialog = new ztoolkit.Dialog(1, 1)
    .addCell(0, 0, {
      tag: "div",
      namespace: "html",
      id: "authorsearch-root",
      styles: {
        display: "flex",
        flex: "1",
        width: "100%",
        height: "100%",
        minHeight: "0",
        minWidth: "0",
      },
    })
    .setDialogData({ loadCallback: () => complete() })
    .open(title, {
      centerscreen: true,
      resizable: true,
      noDialogMode: true,
      fitContent: false,
      width: 800,
      height: 550,
    });
  const win = dialog.window as Window;
  if (!win) throw new Error("Unable to open Author Search results");
  return { window: win, ready: waitForDialogLoad(win, owner, loaded) };
}

/** Append into V1.1's existing body; never replace documentElement or stop navigation. */
export function populateResultsDocument(win: Window, owner: any) {
  const parsed = new owner.DOMParser().parseFromString(
    template,
    "application/xhtml+xml",
  );
  if (parsed.querySelector("parsererror"))
    throw new Error("Invalid Author Search window template");
  const doc = win.document;
  const host = doc.getElementById("authorsearch-root");
  if (!host) throw new Error("Author Search dialog mount is missing");
  const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
  style.textContent = stylesheet;
  doc.head.appendChild(style);
  host.appendChild(doc.importNode(parsed.querySelector("main"), true));
}
