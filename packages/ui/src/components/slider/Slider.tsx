import { SliderMode, SliderRendering, type SliderProps } from "$/components/slider/types";
import { SliderEntry } from "$/components/slider/variants/entry";
import { FilmstripSlider } from "$/components/slider/variants/filmstrip/FilmstripSlider";
import { NativeSlider } from "$/components/slider/variants/native/NativeSlider";
import { ScalarSlider } from "$/components/slider/variants/normal/ScalarSlider";
import { ThresholdSlider } from "$/components/slider/variants/threshold/ThresholdSlider";

export function Slider(props: SliderProps) {
  if (props.rendering === SliderRendering.Filmstrip) return <FilmstripSlider {...props} />;
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
