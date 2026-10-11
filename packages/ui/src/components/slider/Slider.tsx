import { SliderMode, SliderRendering, type SliderProps } from "$/components/slider/types";
import { SliderEntry } from "$/components/slider/variants/entry";
import { NativeSlider } from "$/components/slider/variants/native/NativeSlider";
import { ScalarSlider } from "$/components/slider/variants/normal/ScalarSlider";
import { ThresholdSlider } from "$/components/slider/variants/threshold/ThresholdSlider";

export function Slider(props: SliderProps) {
  if (props.mode === SliderMode.Range) {
    const { mode: _mode, rendering: _rendering, ...options } = props;
    return <ThresholdSlider {...options} />;
  }
  if (props.rendering === SliderRendering.BrowserRange) {
    const { mode: _mode, rendering: _rendering, ...options } = props;
    return <NativeSlider {...options} />;
  }
  if (props.rendering === SliderRendering.NumberEntry) {
    const { mode: _mode, rendering: _rendering, ...options } = props;
    return <SliderEntry {...options} />;
  }
  const { mode: _mode, rendering: _rendering, ...options } = props;
  return <ScalarSlider {...options} />;
}
