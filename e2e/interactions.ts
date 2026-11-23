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
      !(error instanceof Error) ||
      !error.message.includes("stale element reference");
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
