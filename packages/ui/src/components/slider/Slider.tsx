import { SliderVariant, type SliderProps } from "$/components/slider/types";
import { SliderEntry } from "$/components/slider/variants/entry";
import { ScalarSlider } from "$/components/slider/variants/normal/ScalarSlider";
import { ThresholdSlider } from "$/components/slider/variants/threshold/ThresholdSlider";

export function Slider(props: SliderProps) {
  if (props.variant === SliderVariant.Entry) return <SliderEntry {...props} />;
  if (props.variant === SliderVariant.Threshold) return <ThresholdSlider {...props} />;
  return <ScalarSlider {...props} />;
}
