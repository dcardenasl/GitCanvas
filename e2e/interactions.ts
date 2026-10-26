import { $, browser } from "@wdio/globals";

/** Confirms the user-visible result when an action removes its own element. */
export async function clickAndConfirm(
  selector: string,
  confirm: () => Promise<void>,
): Promise<void> {
  try {
    await $(selector).click();
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("stale element reference")
    ) {
      throw error;
    }
  }
  await confirm();
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
