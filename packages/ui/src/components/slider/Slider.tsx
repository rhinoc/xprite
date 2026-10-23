import { SliderRendering, type SliderProps } from "$/components/slider/types";
import { SliderEntry } from "$/components/slider/variants/entry";
import { NativeSlider } from "$/components/slider/variants/native/NativeSlider";
import { ScalarSlider } from "$/components/slider/variants/normal/ScalarSlider";

export function Slider(props: SliderProps) {
  if (props.rendering === SliderRendering.BrowserRange) {
    const { rendering: _rendering, ...options } = props;
    return <NativeSlider {...options} />;
  }
  if (props.rendering === SliderRendering.NumberEntry) {
    const { rendering: _rendering, ...options } = props;
    return <SliderEntry {...options} />;
  }
  const { rendering: _rendering, ...options } = props;
  return <ScalarSlider {...options} />;
}
