#!/usr/bin/env python3
"""Recreate editable Hello documents and raster exports using native Aseprite."""

import argparse
import bisect
import hashlib
import json
import math
import pathlib
import shutil
import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUTPUT = ROOT / "apps/growth/public/showcase/ipad/hello"
SOURCE = HERE / "hello-path.json"
DEFAULT_ASEPRITE = "/Applications/Aseprite-dev.app/Contents/MacOS/aseprite"
ANIMATION_DOCUMENT = "hello.aseprite"
WRITING_DOCUMENT = "hello-writing.aseprite"
MOTION_SAMPLES = 4097
MOTION_CURVE_SAMPLES = 1024
MOTION_PRECISION = 7


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def sampled_path(source, samples_per_curve):
    points = [source["start"]]
    lengths = [0]
    start = source["start"]
    for curve in source["curves"]:
        for step in range(1, samples_per_curve + 1):
            progress = step / samples_per_curve
            inverse = 1 - progress
            point = {
                axis: inverse ** 3 * start[axis]
                + 3 * inverse ** 2 * progress * curve["control1"][axis]
                + 3 * inverse * progress ** 2 * curve["control2"][axis]
                + progress ** 3 * curve["end"][axis]
                for axis in ("x", "y")
            }
            lengths.append(lengths[-1] + math.hypot(
                point["x"] - points[-1]["x"], point["y"] - points[-1]["y"]))
            points.append(point)
        start = curve["end"]
    return points, lengths


def sample_at(points, lengths, progress):
    target = max(0, min(1, progress)) * lengths[-1]
    index = max(1, bisect.bisect_left(lengths, target))
    fraction = (target - lengths[index - 1]) / (lengths[index] - lengths[index - 1])
    return {
        axis: points[index - 1][axis]
        + (points[index][axis] - points[index - 1][axis]) * fraction
        for axis in ("x", "y")
    }


def native_pixel_path(source):
    # Reproduce only the native generator's coordinate sequence, not its images.
    # A writing cel reveals a prefix of this sequence. Remember its source-path
    # progress so the unchanged PNGs can follow a Pencil moving at uniform speed.
    points, lengths = sampled_path(source, source["curveSamples"])
    count = math.ceil(lengths[-1] * 2)
    previous = tuple(math.floor(source["start"][axis] + 0.5) for axis in ("x", "y"))
    pixels = []
    for step in range(1, count + 1):
        progress = step / count
        point = sample_at(points, lengths, progress)
        end_x, end_y = (math.floor(point[axis] + 0.5) for axis in ("x", "y"))
        x, y = previous
        dx, dy = abs(end_x - x), -abs(end_y - y)
        sx, sy = 1 if x < end_x else -1, 1 if y < end_y else -1
        error = dx + dy
        while True:
            if not pixels or pixels[-1][:2] != (x, y):
                pixels.append((x, y, progress))
            if (x, y) == (end_x, end_y):
                break
            twice_error = 2 * error
            if twice_error >= dy:
                error += dy
                x += sx
            if twice_error <= dx:
                error += dx
                y += sy
        previous = end_x, end_y
    return pixels


def write_motion(source, manifest):
    if manifest["pathSourceSha256"] != digest(SOURCE):
        raise ValueError("Regenerate native exports before changing the lettering source")
    if manifest["writing"]["sourceSha256"] != digest(OUTPUT / WRITING_DOCUMENT):
        raise ValueError("Writing document differs from its native export manifest")
    points, lengths = sampled_path(source, MOTION_CURVE_SAMPLES)
    brush_center = source["brushSize"] / 2
    samples = []
    for step in range(MOTION_SAMPLES):
        point = sample_at(points, lengths, step / (MOTION_SAMPLES - 1))
        samples.append([
            round(point[axis] + brush_center, MOTION_PRECISION) for axis in ("x", "y")
        ])

    pixels = native_pixel_path(source)
    frame_progress = []
    for frame in manifest["writing"]["frames"]:
        x, y, progress = pixels[math.floor((len(pixels) - 1) * frame["progress"])]
        if frame["tip"] != {"x": x + brush_center, "y": y + brush_center}:
            raise ValueError("Native writing tip differs from the source pixel path")
        frame_progress.append(progress)
    frame_progress[0], frame_progress[-1] = 0, 1
    write_json(OUTPUT / "motion.json", {
        "pathSource": manifest["pathSource"],
        "pathSourceSha256": manifest["pathSourceSha256"],
        "writingSourceSha256": manifest["writing"]["sourceSha256"],
        "durationMs": manifest["writing"]["durationMs"],
        "length": lengths[-1],
        "sampling": "Equal arc-length samples of the source Beziers, offset to the brush center",
        "timing": "Continuous-gesture retiming: writingFrameProgress maps unchanged native PNG frames to Pencil arc length; native 33/34 ms cel durations are not used for showcase writing playback",
        "samples": samples,
        "writingFrameProgress": frame_progress,
    })
    return len(samples)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aseprite", default=shutil.which("aseprite") or DEFAULT_ASEPRITE)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--writing-only", action="store_true",
                      help="Regenerate the writing process without changing final animation files")
    mode.add_argument("--motion-only", action="store_true",
                      help="Export Pencil motion without modifying any native document or image")
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = json.loads(SOURCE.read_text())
    if args.motion_only:
        manifest = json.loads((OUTPUT / "frames.json").read_text())
        sample_count = write_motion(source, manifest)
        print(json.dumps({"motion": str(OUTPUT / "motion.json"), "samples": sample_count}))
        return

    def native(*arguments):
        subprocess.run([args.aseprite, "--batch", *map(str, arguments)], check=True)

    native(
        "--script-param", f"source={SOURCE}",
        "--script-param", f"output={OUTPUT}",
        "--script-param", f"writingOnly={str(args.writing_only).lower()}",
        "--script", HERE / "generate-hello.lua",
    )
    # Reopen the saved .aseprite documents for every export. Neither the browser
    # nor Python draws the lettering or substitutes independently rendered art.
    if not args.writing_only:
        native(
            OUTPUT / ANIMATION_DOCUMENT,
            "--sheet-type", "horizontal", "--format", "json-array", "--list-layers",
            "--sheet", OUTPUT / "animation.png", "--data", OUTPUT / "animation.json",
            "--save-as", OUTPUT / "hello.gif",
        )
    if not args.writing_only:
        native(
            OUTPUT / ANIMATION_DOCUMENT,
            "--sheet-type", "rows", "--sheet-columns", 3,
            "--format", "json-array",
            "--sheet", OUTPUT / "hello-sheet.png",
            "--data", OUTPUT / "hello-sheet.json",
        )
    native(
        OUTPUT / WRITING_DOCUMENT,
        "--sheet-type", "rows", "--sheet-columns", source["writingSheetColumns"],
        "--format", "json-array", "--list-layers",
        "--sheet", OUTPUT / "writing.png", "--data", OUTPUT / "writing.json",
    )
    if not args.writing_only:
        native(
            OUTPUT / ANIMATION_DOCUMENT,
            "--save-as", OUTPUT / "hello-frame-{frame01}.png",
        )

    def readback(filename):
        with tempfile.TemporaryDirectory(prefix="xprite-hello-readback-") as directory:
            report_path = pathlib.Path(directory) / "report.json"
            native(
                "--script-param", f"source={OUTPUT / filename}",
                "--script-param", f"output={report_path}",
                "--script", HERE / "hello-readback.lua",
            )
            return json.loads(report_path.read_text())

    animation = json.loads((OUTPUT / "animation.json").read_text())
    writing = json.loads((OUTPUT / "writing.json").read_text())
    tips = json.loads((OUTPUT / "writing-tips.json").read_text())
    animation_readback = readback(ANIMATION_DOCUMENT)
    writing_readback = readback(WRITING_DOCUMENT)
    gif_readback = readback("hello.gif")
    animation_frames = [
        {
            "index": index,
            "durationMs": frame["duration"],
            "rect": frame["frame"],
            "image": f"hello-frame-{index + 1:02}.png",
        }
        for index, frame in enumerate(animation["frames"])
    ]
    writing_frames = [
        {
            "index": index,
            "durationMs": frame["duration"],
            "rect": frame["frame"],
            "progress": tips[index]["progress"],
            "tip": tips[index]["tip"],
        }
        for index, frame in enumerate(writing["frames"])
    ]
    metadata = {
        "schemaVersion": 1,
        "width": animation_readback["width"],
        "height": animation_readback["height"],
        "pathSource": "scripts/showcase/ipad/hello-path.json",
        "pathSourceSha256": digest(SOURCE),
        "generator": "scripts/showcase/ipad/generate-hello.py",
        "asepriteVersion": animation_readback["asepriteVersion"],
        "pixelMethod": "2px square brush; integer Bresenham lines; no antialiasing",
        "animation": {
            "source": ANIMATION_DOCUMENT,
            "sourceSha256": digest(OUTPUT / ANIMATION_DOCUMENT),
            "sheet": "animation.png",
            "sheetSize": animation["meta"]["size"],
            "nativeExport": "animation.json",
            "frameCount": len(animation_frames),
            "loopDurationMs": sum(frame["durationMs"] for frame in animation_frames),
            "frames": animation_frames,
            "colors": animation_readback["colors"],
            "colorCount": animation_readback["colorCount"],
            "layers": animation_readback["layers"],
            "layerStates": animation_readback["layerStates"],
        },
        "writing": {
            "source": WRITING_DOCUMENT,
            "sourceSha256": digest(OUTPUT / WRITING_DOCUMENT),
            "sheet": "writing.png",
            "sheetSize": writing["meta"]["size"],
            "nativeExport": "writing.json",
            "frameCount": len(writing_frames),
            "durationMs": sum(frame["durationMs"] for frame in writing_frames),
            "frames": writing_frames,
            "layerStates": writing_readback["layerStates"],
            "colors": writing_readback["colors"],
            "colorCount": writing_readback["colorCount"],
            "relationship": "Black-ink drawing process using the same lettering source; final color animation is a separate 8-frame document.",
        },
        "gif": {
            "file": "hello.gif",
            "sha256": digest(OUTPUT / "hello.gif"),
            "frameCount": gif_readback["frameCount"],
            "durationsMs": [frame["durationMs"] for frame in gif_readback["frames"]],
            "colors": gif_readback["colors"],
            "colorCount": gif_readback["colorCount"],
        },
    }
    write_json(OUTPUT / "frames.json", metadata)
    write_motion(source, metadata)
    # Fold the generated tip positions into the manifest so it is the single
    # runtime metadata document; source control points remain only in JSON.
    (OUTPUT / "writing-tips.json").unlink()
    print(json.dumps({
        "source": str(OUTPUT / ANIMATION_DOCUMENT),
        "dimensions": [metadata["width"], metadata["height"]],
        "animationFrames": metadata["animation"]["frameCount"],
        "durationsMs": metadata["gif"]["durationsMs"],
        "colors": metadata["animation"]["colorCount"],
        "writingFrames": metadata["writing"]["frameCount"],
    }, indent=2))


if __name__ == "__main__":
    main()
