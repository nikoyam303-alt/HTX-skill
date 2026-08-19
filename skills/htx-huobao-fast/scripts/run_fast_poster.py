#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path
from PIL import Image, ImageFilter

COMPOSITOR = Path(__file__).resolve().with_name("compose_fast_poster.py")
PREVIEW_SIZE = (384, 256)
MAX_SCALE = 31 / 32
MIN_SCALE = 0.86
MAX_FOREGROUND_WIDTH = 760
RIGHT_SAFE_EDGE = 1040
FALLBACK_CROP_X = 260
FALLBACK_UPPER_BODY_CUT_Y = 760


def detect_foreground_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    preview = image.resize(PREVIEW_SIZE, Image.Resampling.BILINEAR)
    edges = preview.filter(ImageFilter.GaussianBlur(0.6)).filter(ImageFilter.FIND_EDGES)
    pixels = edges.load()
    width, height = preview.size
    column_counts = [0] * width
    row_counts = [0] * height
    for y in range(4, height - 4):
        for x in range(width // 4, width - 4):
            if max(pixels[x, y]) >= 65:
                column_counts[x] += 1
                row_counts[y] += 1
    columns = [x for x, count in enumerate(column_counts) if count >= 4]
    rows = [y for y, count in enumerate(row_counts) if count >= 4]
    if not columns or not rows:
        return None
    x0 = max(0, min(columns) - 4)
    y0 = max(0, min(rows) - 4)
    x1 = min(width, max(columns) + 5)
    y1 = min(height, max(rows) + 5)
    scale_x = image.width / width
    scale_y = image.height / height
    bbox = (
        round(x0 * scale_x),
        round(y0 * scale_y),
        round(x1 * scale_x),
        round(y1 * scale_y),
    )
    if bbox[2] - bbox[0] < image.width * 0.2 or bbox[2] < image.width * 0.55:
        return None
    return bbox


def detect_leg_start(
    image: Image.Image,
    bbox: tuple[int, int, int, int],
) -> int | None:
    pixels = image.load()
    width, height = image.size
    box_width = bbox[2] - bbox[0]
    box_height = bbox[3] - bbox[1]
    x0 = max(0, round(bbox[0] + box_width * 0.10))
    x1 = min(width, round(bbox[2] - box_width * 0.25))
    y0 = max(0, round(bbox[1] + box_height * 0.45))
    y1 = min(height, bbox[3])
    if x1 <= x0 or y1 <= y0:
        return None

    blue_threshold = max(14, round((x1 - x0) * 0.04))
    shirt_rows = []
    for y in range(y0, y1):
        background = tuple(
            sum(pixels[x, y][channel] for x in range(min(24, width)))
            / min(24, width)
            for channel in range(3)
        )
        blue_count = 0
        for x in range(x0, x1):
            red, green, blue = pixels[x, y]
            foreground_difference = max(
                abs(red - background[0]),
                abs(green - background[1]),
                abs(blue - background[2]),
            )
            if (
                foreground_difference >= 30
                and blue >= red + 30
                and blue >= green + 18
                and blue <= 248
                and green <= 125
            ):
                blue_count += 1
        if blue_count >= blue_threshold:
            shirt_rows.append(y)
    if not shirt_rows:
        return None

    runs = []
    run_start = shirt_rows[0]
    run_end = shirt_rows[0]
    for y in shirt_rows[1:]:
        if y == run_end + 1:
            run_end = y
        else:
            runs.append((run_start, run_end))
            run_start = y
            run_end = y
    runs.append((run_start, run_end))
    shirt_start, shirt_end = max(runs, key=lambda run: run[1] - run[0])
    if shirt_end - shirt_start < max(20, round(box_height * 0.08)):
        return None
    skin_threshold = max(12, round((x1 - x0) * 0.03))
    consecutive = 0
    first_skin_row = None
    for y in range(shirt_end + 1, min(y1, shirt_end + round(box_height * 0.20))):
        background = tuple(
            sum(pixels[x, y][channel] for x in range(min(24, width)))
            / min(24, width)
            for channel in range(3)
        )
        skin_count = 0
        for x in range(x0, x1):
            red, green, blue = pixels[x, y]
            foreground_difference = max(
                abs(red - background[0]),
                abs(green - background[1]),
                abs(blue - background[2]),
            )
            if (
                foreground_difference >= 30
                and red >= 150
                and red >= green + 15
                and red >= blue + 15
            ):
                skin_count += 1
        if skin_count >= skin_threshold:
            if consecutive == 0:
                first_skin_row = y
            consecutive += 1
            if consecutive >= 3:
                return first_skin_row
        else:
            consecutive = 0
            first_skin_row = None
    return shirt_end + 1


def crop_scene(source: Path, output: Path) -> dict[str, object]:
    image = Image.open(source).convert("RGB")
    detected = detect_foreground_bbox(image)
    if detected is None:
        resize_scale = MAX_SCALE
        crop_x = FALLBACK_CROP_X
        framing_mode = "fallback"
    else:
        foreground_width = detected[2] - detected[0]
        resize_scale = max(MIN_SCALE, min(MAX_SCALE, MAX_FOREGROUND_WIDTH / foreground_width))
        crop_x = round(detected[2] * resize_scale - RIGHT_SAFE_EDGE)
        framing_mode = "adaptive"
    resized_size = (round(image.width * resize_scale), round(image.height * resize_scale))
    resized = image.resize(resized_size, Image.Resampling.LANCZOS)
    resized_bbox = None
    if detected is not None:
        resized_bbox = tuple(round(value * resize_scale) for value in detected)
    leg_start_y = detect_leg_start(resized, resized_bbox) if resized_bbox else None
    if leg_start_y is None or not (620 <= leg_start_y <= min(860, resized.height)):
        upper_body_cut_y = min(FALLBACK_UPPER_BODY_CUT_Y, resized.height)
        upper_body_mode = "fallback"
    else:
        upper_body_cut_y = max(620, leg_start_y - 12)
        upper_body_mode = "leg-detected"
    top_extension = 1080 - upper_body_cut_y
    crop_x = max(0, crop_x)
    right_padding = max(0, crop_x + 1080 - resized.width)
    if right_padding:
        sample_width = min(8, resized.width)
        background_strip = resized.crop(
            (resized.width - sample_width, 0, resized.width, resized.height)
        ).resize(
            (right_padding, resized.height), Image.Resampling.BILINEAR
        )
        extended = Image.new("RGB", (resized.width + right_padding, resized.height))
        extended.paste(resized, (0, 0))
        extended.paste(background_strip, (resized.width, 0))
        resized = extended
    scene = resized.crop((crop_x, 0, crop_x + 1080, upper_body_cut_y))
    top_row = scene.crop((0, 0, 1080, 1)).resize(
        (1080, top_extension), Image.Resampling.NEAREST
    )
    square = Image.new("RGB", (1080, 1080))
    square.paste(top_row, (0, 0))
    square.paste(scene, (0, top_extension))
    square.save(output, format="PNG", compress_level=1)
    return {
        "framingMode": framing_mode,
        "foregroundBBox": detected,
        "resizeScale": round(resize_scale, 4),
        "cropX": crop_x,
        "rightPadding": right_padding,
        "rightPaddingSource": "right-edge",
        "upperBodyMode": upper_body_mode,
        "legStartY": leg_start_y,
        "upperBodyCutY": upper_body_cut_y,
        "topExtension": top_extension,
        "upperBodyRescaled": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--subtitle", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--date", required=True)
    args = parser.parse_args()
    started = time.perf_counter()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    scene = args.output.with_name(f".{args.output.stem}-scene.png")
    framing = crop_scene(args.source.resolve(), scene)
    try:
        subprocess.run(
            [
                sys.executable, str(COMPOSITOR),
                "--scene", str(scene),
                "--output", str(args.output.resolve()),
                "--subtitle", args.subtitle,
                "--title", args.title,
                "--date", args.date,
            ],
            check=True,
        )
    finally:
        scene.unlink(missing_ok=True)
    print({
        "output": str(args.output.resolve()),
        **framing,
        "totalLocalSeconds": round(time.perf_counter() - started, 3),
    })


if __name__ == "__main__":
    main()
