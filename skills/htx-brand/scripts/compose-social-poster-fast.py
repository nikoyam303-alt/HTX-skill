#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import io
import itertools
import re
import time
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

SKILL_ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = SKILL_ROOT / "assets" / "fonts"
TEXT_LEFT = 80
TEXT_TOP = 80
TITLE_TOP = 152
BOTTOM_SAFE = 80
TEXT_WIDTH = 920
LOGO_PNG_BASE64 = "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"


def font(text: str, size: int, weight: str) -> ImageFont.FreeTypeFont:
    suffix = {"regular": "Regular", "medium": "Medium", "bold": "Bold"}[weight]
    family = "Urbanist" if all(ord(char) < 128 for char in text) else "HarmonyOS-Sans-SC"
    return ImageFont.truetype(FONT_DIR / f"{family}-{suffix}.ttf", size)


def width(draw: ImageDraw.ImageDraw, text: str, size: int, weight: str) -> int:
    box = draw.textbbox((0, 0), text, font=font(text, size, weight), anchor="lt")
    return box[2] - box[0]


def fit(draw: ImageDraw.ImageDraw, lines: list[str], maximum: int, minimum: int, max_width: int) -> int:
    for size in range(maximum, minimum - 1, -2):
        if all(width(draw, line, size, "bold") <= max_width for line in lines):
            return size
    return minimum


def title_tokens(text: str) -> list[str]:
    if text.isascii():
        return re.findall(r"\S+\s*", text) or [text]
    return re.findall(r"[\x00-\x7f]+|[^\x00-\x7f]", text) or [text]


def title_token_weight(token: str) -> float:
    return len(token) * 0.6 if token.isascii() else 1.0


def preferred_title_cuts(text: str, tokens: list[str]) -> tuple[int, ...]:
    if len(tokens) < 2:
        return ()
    if text.isascii() and len(tokens) < 3:
        return ()
    if not text.isascii() and len(text) <= 7:
        return ()
    cut = min(
        range(1, len(tokens)),
        key=lambda index: abs(
            sum(map(title_token_weight, tokens[:index]))
            - sum(map(title_token_weight, tokens[index:]))
        ),
    )
    return (cut,)


def title_layouts(
    text: str,
    maximum_lines: int = 4,
) -> list[tuple[list[str], tuple[int, ...]]]:
    tokens = title_tokens(text)
    layouts: list[tuple[list[str], tuple[int, ...]]] = []
    for line_count in range(1, min(maximum_lines, len(tokens)) + 1):
        for cuts in itertools.combinations(range(1, len(tokens)), line_count - 1):
            boundaries = (0, *cuts, len(tokens))
            lines = [
                "".join(tokens[boundaries[index]:boundaries[index + 1]])
                for index in range(line_count)
            ]
            if "".join(lines) == text:
                layouts.append((lines, cuts))
    return layouts


def scene_foreground_mask(canvas: Image.Image) -> Image.Image:
    rgb = canvas.convert("RGB")
    row_reference = rgb.crop((0, 0, 40, canvas.height)).resize(
        (1, canvas.height), Image.Resampling.BOX
    ).resize(canvas.size, Image.Resampling.NEAREST)
    red, green, blue = ImageChops.difference(rgb, row_reference).split()
    strongest = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    mask = strongest.point(lambda value: 255 if value >= 30 else 0, mode="L")
    return mask.filter(ImageFilter.MaxFilter(5))


def region_is_clear(
    foreground: Image.Image,
    box: tuple[int, int, int, int],
    padding: int = 14,
    maximum_foreground_pixels: int = 24,
) -> bool:
    left = max(0, box[0] - padding)
    top = max(0, box[1] - padding)
    right = min(foreground.width, box[2] + padding)
    bottom = min(foreground.height, box[3] + padding)
    histogram = foreground.crop((left, top, right, bottom)).histogram()
    return histogram[255] <= maximum_foreground_pixels


def choose_title_layout(
    draw: ImageDraw.ImageDraw,
    foreground: Image.Image,
    text: str,
) -> tuple[list[str], int]:
    tokens = title_tokens(text)
    preferred_cuts = set(preferred_title_cuts(text, tokens))
    candidates: list[tuple[tuple[int, int, int, int, int], list[str], int]] = []
    for lines, cuts in title_layouts(text):
        for size in range(158, 111, -2):
            line_widths = [width(draw, line, size, "bold") for line in lines]
            if max(line_widths) > TEXT_WIDTH:
                continue
            step = int(size * 1.02)
            boxes = [
                draw.textbbox(
                    (TEXT_LEFT, TITLE_TOP + index * step),
                    line,
                    font=font(line, size, "bold"),
                    anchor="lt",
                )
                for index, line in enumerate(lines)
            ]
            if boxes[-1][3] > 900:
                continue
            if not all(region_is_clear(foreground, box) for box in boxes):
                continue
            imbalance = max(line_widths) - min(line_widths)
            cut_deviation = len(preferred_cuts.symmetric_difference(cuts))
            score = (
                -cut_deviation,
                size,
                -len(lines),
                sum(cuts),
                -imbalance,
            )
            candidates.append((score, lines, size))
            break
    if not candidates:
        raise ValueError(
            "title overlaps the detected Huobao/prop region for every 1-4 line "
            "layout at 112-158px; generate a scene with more copy-safe space"
        )
    _, lines, size = max(candidates, key=lambda item: item[0])
    return lines, size


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--subtitle", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--date", required=True)
    args = parser.parse_args()
    started = time.perf_counter()
    canvas = Image.open(args.scene).convert("RGBA")
    if canvas.size != (1080, 1080):
        raise ValueError(f"scene must be 1080x1080, got {canvas.size}")
    draw = ImageDraw.Draw(canvas)
    foreground = scene_foreground_mask(canvas)
    title_lines, title_size = choose_title_layout(draw, foreground, args.title)
    date_lines = args.date.splitlines() or [""]
    subtitle_size = min(54, fit(draw, [args.subtitle], 54, 32, TEXT_WIDTH))
    subtitle_box = draw.textbbox(
        (TEXT_LEFT, TEXT_TOP),
        args.subtitle,
        font=font(args.subtitle, subtitle_size, "medium"),
        anchor="lt",
    )
    if not region_is_clear(foreground, subtitle_box, padding=6, maximum_foreground_pixels=48):
        raise ValueError("subtitle overlaps the detected Huobao/prop region")
    date_size: int | None = None
    date_step = 0
    date_start = 0
    for candidate_size in range(32, 23, -2):
        candidate_step = int(candidate_size * 1.4)
        relative_date_bottom = max(
            draw.textbbox(
                (TEXT_LEFT, index * candidate_step),
                line,
                font=font(line, candidate_size, "regular"),
                anchor="lt",
            )[3]
            for index, line in enumerate(date_lines)
        )
        candidate_start = canvas.height - BOTTOM_SAFE - relative_date_bottom
        date_boxes = [
            draw.textbbox(
                (TEXT_LEFT, candidate_start + index * candidate_step),
                line,
                font=font(line, candidate_size, "regular"),
                anchor="lt",
            )
            for index, line in enumerate(date_lines)
        ]
        if all(
            region_is_clear(
                foreground,
                date_box,
                padding=0,
                maximum_foreground_pixels=48,
            )
            for date_box in date_boxes
        ):
            date_size = candidate_size
            date_step = candidate_step
            date_start = candidate_start
            break
    if date_size is None:
        raise ValueError(
            "date cannot fit at the fixed left-bottom padding at 24-32px"
        )
    draw.text((TEXT_LEFT, TEXT_TOP), args.subtitle, font=font(args.subtitle, subtitle_size, "medium"), fill="white", anchor="lt")
    for index, line in enumerate(title_lines):
        draw.text((TEXT_LEFT, TITLE_TOP + index * int(title_size * 1.02)), line, font=font(line, title_size, "bold"), fill="white", anchor="lt")
    for index, line in enumerate(date_lines):
        draw.text((TEXT_LEFT, date_start + index * date_step), line, font=font(line, date_size, "regular"), fill=(255, 255, 255, 204), anchor="lt")
    logo = Image.open(io.BytesIO(base64.b64decode(LOGO_PNG_BASE64))).convert("RGBA")
    canvas.alpha_composite(logo, (920, 60))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(args.output, quality=95, optimize=True)
    print({
        "output": str(args.output),
        "titleSize": title_size,
        "titleLines": title_lines,
        "dateY": date_start,
        "collisionChecked": True,
        "composeSeconds": round(time.perf_counter() - started, 3),
    })


if __name__ == "__main__":
    main()
