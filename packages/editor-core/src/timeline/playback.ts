import { AsepriteTagDirection, type AsepriteTag } from "$/import-export/aseprite/model";
export enum AsepritePlaybackMode {
  All = "all",
  Loop = "loop",
  WithoutTags = "without-tags",
  Once = "once",
  Stopped = "stopped",
}
interface PlayingTag {
  tag: AsepriteTag;
  forward: number;
  repeat: number;
  rewind: boolean;
  delayedDelete?: PlayingTag;
  removeThese: AsepriteTag[];
}
const contains = (t: AsepriteTag, f: number) => f >= t.from && f <= t.to;
const ping = (t: AsepriteTag) => t.direction.startsWith(AsepriteTagDirection.PingPong);
/** Playback state machine based on the MIT-licensed doc::Playback library.
 * Stack traversal avoids expanding nested repetitions into enormous frame
 * arrays; authored tag order is retained. */
export class AsepriteAnimationPlayback {
  frame: number;
  readonly initialFrame: number;
  mode: AsepritePlaybackMode;
  private playing: PlayingTag[] = [];
  private played = new Set<AsepriteTag>();
  private forward = 1;
  constructor(
    private lastFrame: number,
    private tags: readonly AsepriteTag[],
    frame: number,
    mode: AsepritePlaybackMode,
    tag?: AsepriteTag,
    forward = 1,
  ) {
    this.tags = [...tags].sort((a, b) => a.from - b.from || b.to - a.to);
    this.frame = frame;
    this.initialFrame = frame;
    this.mode = mode;
    this.forward = forward;
    if (mode === AsepritePlaybackMode.Once) {
      if (tag) {
        this.frame =
          tag.direction === AsepriteTagDirection.Reverse ||
          tag.direction === AsepriteTagDirection.PingPongReverse
            ? tag.to
            : tag.from;
        this.addTag(tag, false, 1);
      } else this.frame = 0;
    } else if (mode === AsepritePlaybackMode.Loop && tag) {
      this.addTag(tag, false, 1);
      this.playing[this.playing.length - 1].repeat = Number.MAX_SAFE_INTEGER;
    }
    this.enter(frame, true);
  }
  private top() {
    return this.playing[this.playing.length - 1];
  }
  private parentForward() {
    return this.top()?.forward ?? this.forward;
  }
  private first(tag: AsepriteTag) {
    return this.parentForward() < 0 ? tag.to : tag.from;
  }
  private last(tag: AsepriteTag) {
    return this.parentForward() > 0 ? tag.to : tag.from;
  }
  stop() {
    if (this.mode === AsepritePlaybackMode.All || this.mode === AsepritePlaybackMode.Once)
      this.frame = this.initialFrame;
    this.mode = AsepritePlaybackMode.Stopped;
  }
  next(delta = 1) {
    const step = delta > 0 ? 1 : -1;
    for (
      let count = Math.abs(delta);
      count > 0 && this.mode !== AsepritePlaybackMode.Stopped;
      count--
    ) {
      if (this.exit(step)) this.move(step);
      this.enter(step, false);
    }
    return this.frame;
  }
  private enter(delta: number, firstTime: boolean) {
    if (this.mode !== AsepritePlaybackMode.All && this.mode !== AsepritePlaybackMode.Loop) return;
    const tag = this.top()?.tag,
      frame = this.frame,
      forward = this.parentForward();
    for (const next of this.tags) {
      if (!contains(next, frame) || this.played.has(next)) continue;
      if (tag && (tag.to < next.to || tag.from > next.from)) this.addTag(next, true, 1);
      else {
        this.addTag(next, false, forward);
        if (!firstTime) {
          this.frame = this.first(next);
          if (frame !== this.frame) this.enter(delta, false);
        }
      }
    }
  }
  private exit(delta: number): boolean {
    if (this.mode === AsepritePlaybackMode.All || this.mode === AsepritePlaybackMode.Loop) {
      const tag = this.top()?.tag;
      if (tag && contains(tag, this.frame)) {
        if (!ping(tag) && delta > 0 && this.frame === this.last(tag)) {
          this.decrement(delta);
          return false;
        }
        if (ping(tag) && this.frame === this.last(tag)) {
          this.top().forward *= -1;
          return this.decrement(delta);
        }
        if (this.mode === AsepritePlaybackMode.Loop) {
          if (delta < 0 && this.frame === this.first(tag)) {
            this.frame = this.last(tag);
            return false;
          }
          return true;
        }
        if (this.mode === AsepritePlaybackMode.All) return true;
      }
      if (
        delta > 0 &&
        ((this.frame === this.lastFrame && this.forward > 0) ||
          (this.frame === 0 && this.forward < 0))
      ) {
        if (this.mode === AsepritePlaybackMode.Loop)
          this.frame = this.forward > 0 ? 0 : this.lastFrame;
        else this.stop();
        return false;
      }
      if (
        delta < 0 &&
        ((this.frame === 0 && this.forward > 0) ||
          (this.frame === this.lastFrame && this.forward < 0))
      ) {
        if (this.mode === AsepritePlaybackMode.Loop)
          this.frame = this.forward > 0 ? this.lastFrame : 0;
        else this.stop();
        return false;
      }
    } else if (this.mode === AsepritePlaybackMode.Once) {
      const p = this.top(),
        tag = p?.tag;
      if (tag) {
        if (
          (tag.direction === AsepriteTagDirection.Forward && this.frame === tag.to) ||
          (tag.direction === AsepriteTagDirection.Reverse && this.frame === tag.from) ||
          (tag.direction === AsepriteTagDirection.PingPong &&
            this.frame === tag.from &&
            p.forward < 0) ||
          (tag.direction === AsepriteTagDirection.PingPongReverse &&
            this.frame === tag.to &&
            p.forward > 0)
        ) {
          this.stop();
          return false;
        }
        if (
          (tag.direction === AsepriteTagDirection.PingPong &&
            this.frame === tag.to &&
            p.forward > 0) ||
          (tag.direction === AsepriteTagDirection.PingPongReverse &&
            this.frame === tag.from &&
            p.forward < 0)
        )
          p.forward *= -1;
      } else if ((delta > 0 && this.frame === this.lastFrame) || (delta < 0 && this.frame === 0)) {
        this.stop();
        return false;
      }
    }
    return true;
  }
  private move(delta: number) {
    if (this.mode === AsepritePlaybackMode.WithoutTags)
      this.frame = (this.frame + delta + this.lastFrame + 1) % (this.lastFrame + 1);
    else if (this.mode !== AsepritePlaybackMode.Stopped) this.frame += delta * this.parentForward();
  }
  private addTag(tag: AsepriteTag, rewind: boolean, forward: number) {
    const p: PlayingTag = {
      tag,
      forward:
        forward *
        (tag.direction === AsepriteTagDirection.Forward ||
        tag.direction === AsepriteTagDirection.PingPong
          ? 1
          : -1),
      repeat: tag.repeat > 0 ? tag.repeat : ping(tag) ? 2 : 1,
      rewind: false,
      removeThese: [],
    };
    if (rewind) {
      p.rewind = true;
      let delayed = this.top();
      while (delayed.delayedDelete) delayed = delayed.delayedDelete;
      delayed.delayedDelete = p;
      p.removeThese.push(...delayed.removeThese, delayed.tag);
      delayed.removeThese = [];
      let at = this.playing.length - 1;
      while (at > 0 && this.playing[at].tag !== delayed.tag) at--;
      this.playing.splice(at, 0, p);
    } else this.playing.push(p);
    this.played.add(tag);
  }
  private decrement(delta: number): boolean {
    while (this.top()) {
      const p = this.top(),
        tag = p.tag;
      if (p.repeat > 1) {
        p.repeat--;
        this.frame = this.first(tag);
        return tag.to > tag.from;
      }
      if (!p.delayedDelete) {
        for (const other of p.removeThese) this.played.delete(other);
        this.played.delete(tag);
      }
      this.playing.pop();
      const parent = this.top(),
        forward = this.parentForward();
      let next = parent?.rewind
        ? this.first(parent.tag)
        : delta * forward < 0
          ? tag.from - 1
          : tag.to + 1;
      if (next < 0 || next > this.lastFrame) {
        if (this.mode === AsepritePlaybackMode.All) {
          this.stop();
          return false;
        }
        if (next < 0) {
          if (!parent) next = this.lastFrame;
          else if (parent.repeat > 1) {
            if (parent.tag.direction === AsepriteTagDirection.PingPongReverse) parent.forward *= -1;
            parent.repeat--;
            next = tag.to + 1;
          } else continue;
        } else if (
          !parent &&
          tag.direction === AsepriteTagDirection.PingPongReverse &&
          tag.from === 0 &&
          tag.to === this.lastFrame
        ) {
          this.frame = this.lastFrame;
          this.enter(delta, false);
          if (this.playing.length > 1) {
            this.top().forward *= -1;
            this.frame = this.first(this.top().tag);
          }
          return false;
        } else if (parent && tag.to === parent.tag.to) {
          if (parent.repeat <= 1) continue;
          if (ping(parent.tag)) {
            parent.forward *= -1;
            next = tag.from - 1;
          } else if (parent.tag.direction === AsepriteTagDirection.Forward) {
            parent.repeat--;
            next = parent.tag.from;
          } else next = 0;
        } else next = 0;
      }
      this.frame = next;
      const newTag = this.top()?.tag;
      if (newTag) {
        if (contains(newTag, this.frame)) return false;
      } else {
        if (
          this.mode === AsepritePlaybackMode.Loop &&
          ping(tag) &&
          tag.from === 0 &&
          tag.to === this.lastFrame
        )
          this.addTag(tag, false, this.parentForward());
        return false;
      }
    }
    return false;
  }
}
