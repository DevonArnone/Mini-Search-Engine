#!/usr/bin/env python3
"""Assemble the README walkthrough from frames written by record-tour.mjs.

    python3 scripts/make-tour-gif.py <frames-dir> docs/assets/tour.gif [--width 960] [--fps 12]

Requires Pillow. Frames share one palette so flat areas do not shimmer.
"""

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("frames")
    parser.add_argument("output")
    parser.add_argument("--width", type=int, default=960)
    parser.add_argument("--fps", type=int, default=12)
    parser.add_argument("--colors", type=int, default=128)
    args = parser.parse_args()

    paths = sorted(Path(args.frames).glob("f*.png"))
    if not paths:
        raise SystemExit(f"no frames in {args.frames}")

    def load(path: Path) -> Image.Image:
        image = Image.open(path).convert("RGB")
        height = round(image.height * args.width / image.width)
        return image.resize((args.width, height), Image.LANCZOS)

    # One palette for the whole film, sampled across it (both themes included).
    samples = [load(path) for path in paths[:: max(1, len(paths) // 24)]]
    sheet = Image.new("RGB", (samples[0].width, samples[0].height * len(samples)))
    for index, sample in enumerate(samples):
        sheet.paste(sample, (0, index * sample.height))
    palette = sheet.quantize(colors=args.colors, method=Image.Quantize.MEDIANCUT)

    frames = [load(path).quantize(palette=palette, dither=Image.Dither.NONE) for path in paths]
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(output, save_all=True, append_images=frames[1:], duration=round(1000 / args.fps), loop=0, optimize=True, disposal=1)
    print(f"{output}: {len(frames)} frames, {output.stat().st_size / 2**20:.1f} MB")


if __name__ == "__main__":
    main()
