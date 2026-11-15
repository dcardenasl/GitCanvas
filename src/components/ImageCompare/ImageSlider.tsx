import { useTranslation } from "react-i18next";

/** Keyboard-native reveal control for the saved image layer. */
export function ImageSlider({
  value,
  onChange,
}: {
  readonly value: number;
  readonly onChange: (value: number) => void;
}) {
  const { t } = useTranslation("image");
  return (
    <label className="image-compare__slider-control">
      <span>{t("sliderLabel")}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        aria-valuetext={t("sliderValue", { value })}
        onChange={(event) => {
          onChange(Number(event.currentTarget.value));
        }}
      />
    </label>
  );
}
