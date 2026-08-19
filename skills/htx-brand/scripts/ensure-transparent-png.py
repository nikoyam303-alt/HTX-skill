import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def transparency_stats(image):
    if "A" not in image.mode:
        return 0.0, 1.0
    alpha = np.asarray(image.getchannel("A"))
    return float(np.mean(alpha < 250)), float(np.mean(alpha > 20))


parser = argparse.ArgumentParser()
parser.add_argument("input")
parser.add_argument("output")
args = parser.parse_args()

source = Image.open(args.input)
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)

transparent_ratio, opaque_ratio = transparency_stats(source)
if transparent_ratio >= 0.05 and opaque_ratio >= 0.05:
    source.convert("RGBA").save(output)
    print(json.dumps({
        "output": str(output),
        "mode": "preserved-alpha",
        "transparentRatio": transparent_ratio,
        "opaqueRatio": opaque_ratio,
    }))
    raise SystemExit(0)

rgb = source.convert("RGB")
pixels = np.asarray(rgb)
channel_min = pixels.min(axis=2)
channel_spread = pixels.max(axis=2) - channel_min
background_candidate = (channel_min >= 210) & (channel_spread <= 14)

mask = Image.fromarray((background_candidate.astype(np.uint8) * 255), "L")
draw = ImageDraw.Draw(mask)
corners = [
    (0, 0),
    (mask.width - 1, 0),
    (0, mask.height - 1),
    (mask.width - 1, mask.height - 1),
]
for corner in corners:
    if mask.getpixel(corner) == 255:
        ImageDraw.floodfill(mask, corner, 128, thresh=1)

connected_background = np.asarray(mask) == 128
background_ratio = float(np.mean(connected_background))
if background_ratio < 0.05:
    raise RuntimeError("No removable light neutral edge-connected background detected")

foreground = Image.fromarray((~connected_background).astype(np.uint8) * 255, "L")
alpha = foreground.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
alpha_pixels = np.asarray(alpha)
rgba = np.dstack([pixels, alpha_pixels]).astype(np.uint8)
rgba[alpha_pixels == 0, :3] = 0
result = Image.fromarray(rgba, "RGBA")
result.save(output)

transparent_ratio, opaque_ratio = transparency_stats(result)
if transparent_ratio < 0.05 or opaque_ratio < 0.05:
    raise RuntimeError("Output transparency validation failed")

print(json.dumps({
    "output": str(output),
    "mode": "removed-light-neutral-background",
    "transparentRatio": transparent_ratio,
    "opaqueRatio": opaque_ratio,
    "removedBackgroundRatio": background_ratio,
}))
