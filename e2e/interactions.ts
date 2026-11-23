import { $, browser, expect } from "@wdio/globals";

export async function revealSidebarItem(selector: string): Promise<void> {
  await browser.execute((targetSelector) => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    const target = document.querySelector<HTMLElement>(targetSelector);
    if (sidebar === null || target === null) {
      throw new Error(`sidebar item is missing: ${targetSelector}`);
    }
    const sidebarBounds = sidebar.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    sidebar.scrollTop += targetBounds.top - sidebarBounds.top;
  }, selector);
  await browser.waitUntil(
    async () =>
      browser.execute((targetSelector) => {
        const sidebar = document.querySelector<HTMLElement>(".sidebar");
        const target = document.querySelector<HTMLElement>(targetSelector);
        if (sidebar === null || target === null) return false;
        const sidebarBounds = sidebar.getBoundingClientRect();
        const targetBounds = target.getBoundingClientRect();
        return (
          targetBounds.top >= sidebarBounds.top &&
          targetBounds.bottom <= sidebarBounds.bottom
        );
      }, selector),
    {
      timeout: 5_000,
      timeoutMsg: `sidebar item did not enter view: ${selector}`,
    },
  );
}

/** Scroll a context-menu item inside its own scroller before WebDriver clicks it. */
export async function revealContextMenuItem(label: string): Promise<void> {
  await browser.execute((expectedLabel) => {
    const item = Array.from(
      document.querySelectorAll<HTMLElement>('.context-menu [role="menuitem"]'),
    ).find(
      (candidate) => candidate.textContent?.includes(expectedLabel) === true,
    );
    if (item === undefined) {
      throw new Error(`context-menu item did not appear: ${expectedLabel}`);
    }
    item.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, label);
}

interface DiagnosticWindow extends Window {
  __gitcanvasE2eEvents?: string[];
  __gitcanvasE2eRecorderInstalled?: boolean;
}

async function resetInteractionTrace(): Promise<void> {
  await browser.execute(() => {
    const diagnosticWindow = window as DiagnosticWindow;
    diagnosticWindow.__gitcanvasE2eEvents = [];
    if (diagnosticWindow.__gitcanvasE2eRecorderInstalled === true) return;
    for (const type of [
      "pointerdown",
      "pointerup",
      "click",
      "focusin",
      "scroll",
    ]) {
      document.addEventListener(
        type,
        (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const element = target.closest<HTMLElement>(
            "button, [role='menuitem'], [role='option'], input, select",
          );
          diagnosticWindow.__gitcanvasE2eEvents?.push(
            `${event.type}:${element?.tagName.toLowerCase() ?? target.tagName.toLowerCase()}:${element?.getAttribute("aria-label") ?? element?.innerText?.trim() ?? ""}`,
          );
        },
        true,
      );
    }
    diagnosticWindow.__gitcanvasE2eRecorderInstalled = true;
  });
}

async function interactionTrace(): Promise<string[]> {
  return browser.execute(
    () => (window as DiagnosticWindow).__gitcanvasE2eEvents ?? [],
  );
}

async function visibleMenus(): Promise<
  { label: string | null; text: string; items: string[] }[]
> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[role='menu']"))
      .filter((menu) => menu.getClientRects().length > 0)
      .map((menu) => ({
        label: menu.getAttribute("aria-label"),
        text: menu.innerText,
        items: Array.from(
          menu.querySelectorAll<HTMLElement>("[role='menuitem']"),
        ).map((item) => item.innerText),
      })),
  );
}

/**
 * WebDriver implementations word a detached element differently: the W3C text
 * is "stale element reference", while the WebKitGTK driver reports "Element is
 * no longer attached to the DOM". Both mean the same thing here.
 */
function isStaleElementError(message: string): boolean {
  return (
    message.includes("stale element reference") ||
    message.includes("no longer attached to the DOM")
  );
}

/** Confirms the user-visible result when an action removes its own element. */
export async function clickAndConfirm(
  selector: string,
  confirm: () => Promise<void>,
): Promise<void> {
  await expect($(selector)).toBeDisplayed();
  await resetInteractionTrace();
  let staleClickError: string | null = null;
  try {
    await $(selector).click();
  } catch (error) {
    const shouldReportClickFailure =
      !(error instanceof Error) || !isStaleElementError(error.message);
    if (shouldReportClickFailure) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${detail}; input trace: ${JSON.stringify(await interactionTrace())}; visible menus: ${JSON.stringify(await visibleMenus())}`,
        { cause: error },
      );
    }
    staleClickError = error.message;
  }
  try {
    await confirm();
    return;
  } catch (error) {
    let diagnosticError: unknown = error;
    if (staleClickError !== null && (await $(selector).isDisplayed())) {
      try {
        await $(selector).click();
        await confirm();
        return;
      } catch (retryError) {
        diagnosticError = retryError;
      }
    }
    const detail =
      diagnosticError instanceof Error
        ? diagnosticError.message
        : String(diagnosticError);
    throw new Error(
      `${detail}; click result: ${staleClickError ?? "completed"}; input trace: ${JSON.stringify(await interactionTrace())}; visible menus: ${JSON.stringify(await visibleMenus())}`,
      { cause: error },
    );
  }
}

/** Updates a React-controlled native select through its DOM setter. */
export async function setReactSelectValue(
  selector: string,
  value: string,
): Promise<void> {
  await browser.execute(
    (selectSelector, nextValue) => {
      const select = document.querySelector<HTMLSelectElement>(selectSelector);
      if (select === null) throw new Error(`Select missing: ${selectSelector}`);
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      if (setter === undefined) throw new Error("Select value setter missing");
      setter.call(select, nextValue);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    },
    selector,
    value,
  );
}
