import { Button, ControlFlow } from "@xprite/ui";

const FRAME_OFFSET = 1;
const PLAYBACK_BUTTON_SIZE = { width: 17, height: 13 };

export interface PlaybackTransportProps {
  playing: boolean;
  frames: number;
  animated: boolean;
  labels: {
    first: string;
    previous: string;
    play: string;
    pause: string;
    next: string;
    last: string;
    group: string;
  };
  titles?: {
    first?: string;
    previous?: string;
    play?: string;
    pause?: string;
    next?: string;
    last?: string;
  };
  onFirst(): void;
  onPrevious(): void;
  onTogglePlayback(): void;
  onNext(): void;
  onLast(): void;
  className?: string;
}

/**
 * Shared first/prev/play/next/last row used by the editor timeline chrome and the
 * tools viewer — one row that sits above the timeline strip.
 */
export function PlaybackTransport({
  playing,
  frames,
  animated,
  labels,
  titles,
  onFirst,
  onPrevious,
  onTogglePlayback,
  onNext,
  onLast,
  className,
}: PlaybackTransportProps) {
  return (
    <ControlFlow className={className} role="group" aria-label={labels.group}>
      <Button
        icon="ani_first"
        pixelSize={PLAYBACK_BUTTON_SIZE}
        pushedPart="buttonset_item_pushed"
        aria-label={labels.first}
        title={titles?.first ?? labels.first}
        disabled={frames <= FRAME_OFFSET}
        onClick={onFirst}
      />
      <Button
        icon="ani_previous"
        pixelSize={PLAYBACK_BUTTON_SIZE}
        pushedPart="buttonset_item_pushed"
        aria-label={labels.previous}
        title={titles?.previous ?? labels.previous}
        disabled={!animated}
        onClick={onPrevious}
      />
      <Button
        icon={playing ? "ani_stop" : "ani_play"}
        pixelSize={PLAYBACK_BUTTON_SIZE}
        pushedPart="buttonset_item_pushed"
        aria-label={playing ? labels.pause : labels.play}
        title={playing ? (titles?.pause ?? labels.pause) : (titles?.play ?? labels.play)}
        selected={playing}
        disabled={!animated}
        onClick={onTogglePlayback}
      />
      <Button
        icon="ani_next"
        pixelSize={PLAYBACK_BUTTON_SIZE}
        pushedPart="buttonset_item_pushed"
        aria-label={labels.next}
        title={titles?.next ?? labels.next}
        disabled={!animated}
        onClick={onNext}
      />
      <Button
        icon="ani_last"
        pixelSize={PLAYBACK_BUTTON_SIZE}
        pushedPart="buttonset_item_pushed"
        aria-label={labels.last}
        title={titles?.last ?? labels.last}
        disabled={frames <= FRAME_OFFSET}
        onClick={onLast}
      />
    </ControlFlow>
  );
}
