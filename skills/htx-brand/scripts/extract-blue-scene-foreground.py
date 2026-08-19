#!/usr/bin/env python3
"""Extract a lightweight foreground layer from a smooth HTX-blue scene.

The output is intended only for sandwich compositing over the exact same
opaque scene: scene -> copy -> foreground. It is not a reusable cutout master.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def design_matrix(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    return np.stack(
        [
            np.ones_like(x),
            x,
            y,
            x * x,
            x * y,
            y * y,
            x * x * x,
            x * x * y,
            x * y * y,
            y * y * y,
        ],
        axis=-1,
    )


def extract(source: Path, output: Path) -> dict[str, float | int | str]:
    image = Image.open(source).convert("RGB")
    rgb = np.asarray(image, dtype=np.float32)
    height, width = rgb.shape[:2]

    yy, xx = np.mgrid[0:height, 0:width]
    xn = xx / max(width - 1, 1)
    yn = yy / max(height - 1, 1)

    # Learn the smooth blue field from regions known to be background in the
    # standard lower-right Huobao composition.
    known_background = (xn <= 0.20) | (yn <= 0.22)
    sampled = known_background & (xx % 6 == 0) & (yy % 6 == 0)
    sample_features = design_matrix(xn[sampled], yn[sampled])
    sample_rgb = rgb[sampled]
    coefficients, _, _, _ = np.linalg.lstsq(sample_features, sample_rgb, rcond=None)

    predicted = design_matrix(xn, yn) @ coefficients
    distance = np.sqrt(np.sum((rgb - predicted) ** 2, axis=2))
    training_distance = distance[known_background]

    low = max(24.0, float(np.percentile(training_distance, 99.8)) + 5.0)
    high = low + 24.0
    alpha = np.clip((distance - low) / (high - low), 0.0, 1.0)
    alpha = alpha * alpha * (3.0 - 2.0 * alpha)

    # The accepted poster scene reserves the upper and left areas for copy.
    # Keeping those regions strictly clear prevents background residuals from
    # covering typography in the sandwich composite.
    subject_zone = (xn >= 0.38) & (yn >= 0.22)
    alpha *= subject_zone

    alpha_image = Image.fromarray(np.uint8(np.round(alpha * 255)), "L")
    alpha_image = alpha_image.filter(ImageFilter.MedianFilter(3))
    alpha_image = alpha_image.filter(ImageFilter.GaussianBlur(0.55))

    rgba = image.convert("RGBA")
    rgba.putalpha(alpha_image)
    output.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(output, optimize=True)

    alpha_array = np.asarray(alpha_image)
    pixels = alpha_array.size
    return {
        "input": str(source),
        "output": str(output),
        "width": width,
        "height": height,
        "thresholdLow": round(low, 2),
        "thresholdHigh": round(high, 2),
        "transparentRatio": round(float(np.count_nonzero(alpha_array < 10) / pixels), 4),
        "opaqueRatio": round(float(np.count_nonzero(alpha_array > 245) / pixels), 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(extract(args.source.resolve(), args.output.resolve()))


if __name__ == "__main__":
    main()
