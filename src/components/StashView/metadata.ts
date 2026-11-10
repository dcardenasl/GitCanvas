import type { StashEntry } from "../../bindings";

/** Keeps the recorded offset visible instead of silently converting it to local time. */
export function stashDate(entry: StashEntry): string | null {
  const date = new Date(
    (Number(entry.recorded_at) + entry.offset_minutes * 60) * 1_000,
  );
  if (!Number.isFinite(date.getTime())) return null;
  const minutes = Math.abs(entry.offset_minutes);
  const offset = `${entry.offset_minutes < 0 ? "-" : "+"}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${date.toISOString().slice(0, 19).replace("T", " ")} ${offset}`;
}

/** Focus is restored after navigation has mounted the destination. */
export function focusStashControl(selector: string): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLButtonElement>(selector)?.focus();
  });
}
