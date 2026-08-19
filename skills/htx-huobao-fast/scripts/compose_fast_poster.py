#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import importlib.util
import io
import re
import time
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageStat


BRAND_COMPOSITOR = Path(__file__).resolve().with_name("compose-social-poster-fast.py")
TEXT_LEFT = 80
TEXT_TOP = 80
TITLE_TOP = 152
MIN_SUBTITLE_TITLE_GAP = 40
TITLE_MAX_RIGHT = 840
TITLE_MAX_WIDTH = TITLE_MAX_RIGHT - TEXT_LEFT
TITLE_MAX_SIZE = 158
TITLE_MIN_SIZE = 96
TITLE_LINE_HEIGHT = 1.08
BOTTOM_SAFE = 80
LOGO_POSITION = (920, 60)
TIME_ICON_SOURCE = Path(__file__).resolve().parent.parent / "assets" / "time-icon.svg"
TIME_ICON_SIZE = 25
TIME_ICON_GAP = 12
REWARD_YELLOW = (255, 200, 0, 255)
WHITE = (255, 255, 255, 255)
MUTED_WHITE = (255, 255, 255, 210)
GRADIENT_TOP = (0, 102, 255, 255)
GRADIENT_BOTTOM = (38, 146, 255, 255)
NON_BREAK_PHRASES = (
    "邀请好友",
    "新用户",
    "立即参与",
    "手续费",
    "瓜分",
    "奖池",
    "奖励",
    "奖金",
    "等你来赢",
    "返佣",
    "赢取",
    "限时",
)
CORE_NUMBER = re.compile(
    r"(?:[$€£¥₿₽₹]\s*)?\d[\d,]*(?:\.\d+)?"
    r"(?:\s*(?:%|％|USDT|USD|BTC|ETH|U|天|日|小时|分钟|倍|万|亿|K|M|B))?",
    re.IGNORECASE,
)


def load_brand_module():
    spec = importlib.util.spec_from_file_location("huobao_brand_compositor", BRAND_COMPOSITOR)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {BRAND_COMPOSITOR}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def title_tokens(text: str) -> list[str]:
    if re.search(r"\s", text):
        return re.findall(r"\S+\s*", text) or [text]
    tokens = []
    index = 0
    phrases = sorted(NON_BREAK_PHRASES, key=len, reverse=True)
    while index < len(text):
        phrase = next(
            (candidate for candidate in phrases if text.startswith(candidate, index)),
            None,
        )
        if phrase is not None:
            tokens.append(phrase)
            index += len(phrase)
            continue
        ascii_run = re.match(r"[\x00-\x7f]+", text[index:])
        if ascii_run is not None:
            tokens.append(ascii_run.group(0))
            index += len(ascii_run.group(0))
            continue
        tokens.append(text[index])
        index += 1
    return tokens or [text]


def normalize_brand_background(canvas: Image.Image, _foreground: Image.Image) -> Image.Image:
    width, height = canvas.size
    source_rgb = canvas.convert("RGB")
    shifted_background = Image.new("RGB", canvas.size)
    for y in range(height):
        ratio = y / max(1, height - 1)
        target = tuple(
            round(GRADIENT_TOP[channel] * (1 - ratio) + GRADIENT_BOTTOM[channel] * ratio)
            for channel in range(3)
        )
        source_sample = source_rgb.crop((0, y, min(40, width), y + 1))
        source_base = tuple(round(value) for value in ImageStat.Stat(source_sample).mean[:3])
        deltas = tuple(target[channel] - source_base[channel] for channel in range(3))
        row = source_rgb.crop((0, y, width, y + 1))
        shifted_channels = []
        for channel, delta in zip(row.split(), deltas):
            lookup = [max(0, min(255, value + delta)) for value in range(256)]
            shifted_channels.append(channel.point(lookup))
        shifted_background.paste(Image.merge("RGB", tuple(shifted_channels)), (0, y))
    red, green, blue = source_rgb.split()
    blue_over_red = ImageChops.subtract(blue, red)
    blue_over_green = ImageChops.subtract(blue, green)
    blue_dominance = ImageChops.darker(blue_over_red, blue_over_green)
    background_mask = blue_dominance.point(
        lambda value: max(0, min(255, (value - 20) * 4))
    )
    normalized_rgb = Image.composite(shifted_background, source_rgb, background_mask)
    return normalized_rgb.convert("RGBA")


def title_layouts(text: str) -> list[list[str]]:
    tokens = title_tokens(text)
    layouts = [[text]]
    for cut in range(1, len(tokens)):
        first = "".join(tokens[:cut]).rstrip()
        second = "".join(tokens[cut:]).lstrip()
        if first and second:
            layouts.append([first, second])
    return layouts


def text_width(draw: ImageDraw.ImageDraw, brand, text: str, size: int) -> int:
    box = draw.textbbox((0, 0), text, font=brand.font(text, size, "bold"), anchor="lt")
    return box[2] - box[0]


def choose_title_layout(
    draw: ImageDraw.ImageDraw,
    brand,
    foreground: Image.Image,
    text: str,
    title_top: int,
):
    candidates = []
    for lines in title_layouts(text):
        for size in range(TITLE_MAX_SIZE, TITLE_MIN_SIZE - 1, -2):
            widths = [text_width(draw, brand, line, size) for line in lines]
            if max(widths) > TITLE_MAX_WIDTH:
                continue
            step = round(size * TITLE_LINE_HEIGHT)
            boxes = [
                draw.textbbox(
                    (TEXT_LEFT, title_top + index * step),
                    line,
                    font=brand.font(line, size, "bold"),
                    anchor="lt",
                )
                for index, line in enumerate(lines)
            ]
            if boxes[-1][3] > 470:
                continue
            if not all(
                brand.region_is_clear(
                    foreground,
                    box,
                    padding=14,
                    maximum_foreground_pixels=24,
                )
                for box in boxes
            ):
                continue
            imbalance = max(widths) - min(widths)
            candidates.append(((size, -len(lines), -imbalance), lines, size, boxes))
            break
    if not candidates:
        raise ValueError(
            "title cannot fit in the two-line x=80..840 copy-safe region; "
            "generate a scene with more copy-safe space or shorten the title"
        )
    _, lines, size, boxes = max(candidates, key=lambda item: item[0])
    return lines, size, boxes


def draw_highlighted_line(
    draw: ImageDraw.ImageDraw,
    brand,
    position: tuple[int, int],
    text: str,
    size: int,
) -> bool:
    line_font = brand.font(text, size, "bold")
    x, y = position
    cursor = x
    highlighted = False
    for match in CORE_NUMBER.finditer(text):
        before = text[: match.start()] if cursor == x else text[previous_end : match.start()]
        if before:
            draw.text((cursor, y), before, font=line_font, fill=WHITE, anchor="lt")
            cursor += round(draw.textlength(before, font=line_font))
        number = match.group(0)
        draw.text((cursor, y), number, font=line_font, fill=REWARD_YELLOW, anchor="lt")
        cursor += round(draw.textlength(number, font=line_font))
        previous_end = match.end()
        highlighted = True
    if not highlighted:
        draw.text((x, y), text, font=line_font, fill=WHITE, anchor="lt")
        return False
    if previous_end < len(text):
        draw.text((cursor, y), text[previous_end:], font=line_font, fill=WHITE, anchor="lt")
    return True


def render_time_icon(size: int) -> Image.Image:
    """Render the supplied Subtract.svg clock as a crisp transparent PNG layer."""
    scale = 4
    extent = size * scale
    mask = Image.new("L", (extent, extent), 0)
    mask_draw = ImageDraw.Draw(mask)
    factor = extent / 25
    circle_end = round(24.9364 * factor)
    mask_draw.ellipse((0, 0, circle_end, circle_end), fill=255)
    hand = [
        (10.2903, 5.02041),
        (10.2903, 15.4384),
        (18.5303, 15.4384),
        (18.5303, 11.9654),
        (13.7642, 11.9654),
        (13.7642, 5.02041),
    ]
    mask_draw.polygon(
        [(round(x * factor), round(y * factor)) for x, y in hand],
        fill=0,
    )
    icon = Image.new("RGBA", (extent, extent), WHITE)
    icon.putalpha(mask)
    return icon.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--subtitle", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--date", required=True)
    args = parser.parse_args()

    started = time.perf_counter()
    brand = load_brand_module()
    canvas = Image.open(args.scene).convert("RGBA")
    if canvas.size != (1080, 1080):
        raise ValueError(f"scene must be 1080x1080, got {canvas.size}")
    draw = ImageDraw.Draw(canvas)
    foreground = brand.scene_foreground_mask(canvas)
    canvas = normalize_brand_background(canvas, foreground)
    draw = ImageDraw.Draw(canvas)

    subtitle_size = min(54, brand.fit(draw, [args.subtitle], 54, 32, TITLE_MAX_WIDTH))
    subtitle_box = draw.textbbox(
        (TEXT_LEFT, TEXT_TOP),
        args.subtitle,
        font=brand.font(args.subtitle, subtitle_size, "medium"),
        anchor="lt",
    )
    if subtitle_box[2] > TITLE_MAX_RIGHT:
        raise ValueError("subtitle enters the reserved logo-safe area")
    if not brand.region_is_clear(foreground, subtitle_box, padding=6, maximum_foreground_pixels=48):
        raise ValueError("subtitle overlaps the detected Huobao/prop region")

    title_top = max(TITLE_TOP, subtitle_box[3] + MIN_SUBTITLE_TITLE_GAP)
    title_lines, title_size, title_boxes = choose_title_layout(
        draw, brand, foreground, args.title, title_top
    )
    title_step = round(title_size * TITLE_LINE_HEIGHT)

    date_lines = args.date.splitlines() or [""]
    time_icon_added = bool(args.date.strip())
    date_text_x = TEXT_LEFT + TIME_ICON_SIZE + TIME_ICON_GAP if time_icon_added else TEXT_LEFT
    date_size = None
    date_step = 0
    date_start = 0
    date_raise = 0
    for candidate_raise in range(0, 161, 20):
        for candidate_size in range(32, 23, -2):
            candidate_step = round(candidate_size * 1.4)
            candidate_bottom = max(
                draw.textbbox(
                    (date_text_x, index * candidate_step),
                    line,
                    font=brand.font(line, candidate_size, "regular"),
                    anchor="lt",
                )[3]
                for index, line in enumerate(date_lines)
            )
            candidate_start = (
                canvas.height - BOTTOM_SAFE - candidate_bottom - candidate_raise
            )
            candidate_boxes = [
                draw.textbbox(
                    (date_text_x, candidate_start + index * candidate_step),
                    line,
                    font=brand.font(line, candidate_size, "regular"),
                    anchor="lt",
                )
                for index, line in enumerate(date_lines)
            ]
            candidate_regions = list(candidate_boxes)
            if time_icon_added:
                first_box = candidate_boxes[0]
                candidate_icon_y = round(
                    (first_box[1] + first_box[3] - TIME_ICON_SIZE) / 2
                )
                candidate_regions.append(
                    (
                        TEXT_LEFT,
                        candidate_icon_y,
                        TEXT_LEFT + TIME_ICON_SIZE,
                        candidate_icon_y + TIME_ICON_SIZE,
                    )
                )
            if all(
                brand.region_is_clear(
                    foreground,
                    box,
                    padding=0,
                    maximum_foreground_pixels=48,
                )
                for box in candidate_regions
            ):
                date_size = candidate_size
                date_step = candidate_step
                date_start = candidate_start
                date_raise = candidate_raise
                date_boxes = candidate_boxes
                break
        if date_size is not None:
            break
    if date_size is None:
        raise ValueError(
            "date group cannot fit at x=80 within the 24–32 px size and 0–160 px upward fallback range"
        )

    draw.text(
        (TEXT_LEFT, TEXT_TOP),
        args.subtitle,
        font=brand.font(args.subtitle, subtitle_size, "medium"),
        fill=WHITE,
        anchor="lt",
    )
    number_highlighted = False
    for index, line in enumerate(title_lines):
        number_highlighted = draw_highlighted_line(
            draw,
            brand,
            (TEXT_LEFT, title_top + index * title_step),
            line,
            title_size,
        ) or number_highlighted
    for index, line in enumerate(date_lines):
        draw.text(
            (date_text_x, date_start + index * date_step),
            line,
            font=brand.font(line, date_size, "regular"),
            fill=MUTED_WHITE,
            anchor="lt",
        )
    time_icon_y = None
    if time_icon_added:
        first_box = date_boxes[0]
        time_icon_y = round((first_box[1] + first_box[3] - TIME_ICON_SIZE) / 2)
        canvas.alpha_composite(render_time_icon(TIME_ICON_SIZE), (TEXT_LEFT, time_icon_y))

    logo = Image.open(io.BytesIO(base64.b64decode(brand.LOGO_PNG_BASE64))).convert("RGBA")
    canvas.alpha_composite(logo, LOGO_POSITION)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(args.output, format="PNG", compress_level=1)
    print(
        {
            "output": str(args.output.resolve()),
            "titleLines": title_lines,
            "titleSize": title_size,
            "titleRight": max(box[2] for box in title_boxes),
            "titleTop": title_top,
            "subtitleTitleGap": title_top - subtitle_box[3],
            "minimumSubtitleTitleGap": MIN_SUBTITLE_TITLE_GAP,
            "titleLineHeight": TITLE_LINE_HEIGHT,
            "logoExclusionZone": [880, 40, 1040, 220],
            "backgroundGradient": ["#0066FF", "#2692FF"],
            "backgroundChannelTolerance": 3,
            "backgroundNormalized": True,
            "dateY": date_start,
            "dateRaisedBy": date_raise,
            "timeIconAdded": time_icon_added,
            "timeIconSource": str(TIME_ICON_SOURCE),
            "timeIconSize": TIME_ICON_SIZE,
            "timeIconGap": TIME_ICON_GAP,
            "timeIconY": time_icon_y,
            "dateTextX": date_text_x,
            "numberHighlighted": number_highlighted,
            "highlightColor": "#FFC800",
            "composeSeconds": round(time.perf_counter() - started, 3),
        }
    )


if __name__ == "__main__":
    main()
