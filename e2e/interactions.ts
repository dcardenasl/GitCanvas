import { $, browser, expect } from "@wdio/globals";

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
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
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
