#!/usr/bin/env python3
"""
Crop DoChess's 3x2 bot avatar sheets into individual portrait PNGs.

Usage:
    python split_bot_avatars.py --straight path/to/straight.png --happy path/to/happy.png --angry path/to/angry.png --output DoChess_Bot_Avatars

The default panel coordinates match the provided 1254x1254 sheets.
If the source sheet layout changes, update CROP_BOXES below.
"""
from pathlib import Path
from PIL import Image
import argparse

CROP_BOXES = [
    (19, 129, 409, 602),    # 1: top-left, red
    (429, 129, 819, 602),   # 2: top-middle, purple
    (839, 129, 1229, 602), # 3: top-right, teal
    (19, 625, 409, 1109),  # 4: bottom-left, cyan
    (429, 625, 819, 1109), # 5: bottom-middle, gold
    (839, 625, 1229, 1109) # 6: bottom-right, yellow
]
TARGET_SIZE = (390, 484)
BACKGROUND = (7, 11, 20)

def export_sheet(source, expression, output):
    source = Path(source)
    sheet = Image.open(source).convert("RGB")
    folder = Path(output) / expression
    folder.mkdir(parents=True, exist_ok=True)
    for bot_id, box in enumerate(CROP_BOXES, start=1):
        crop = sheet.crop(box)
        crop.thumbnail(TARGET_SIZE, Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", TARGET_SIZE, BACKGROUND)
        canvas.paste(crop, ((TARGET_SIZE[0] - crop.width) // 2,
                            (TARGET_SIZE[1] - crop.height) // 2))
        canvas.save(folder / f"bot-{bot_id}.png", optimize=True)
    print(f"Exported 6 {expression} avatars to {folder}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--straight", required=True, help="Neutral/straight expression sheet")
    parser.add_argument("--happy", required=True, help="Happy expression sheet")
    parser.add_argument("--angry", required=True, help="Angry expression sheet")
    parser.add_argument("--output", default="DoChess_Bot_Avatars")
    args = parser.parse_args()
    export_sheet(args.straight, "straight", args.output)
    export_sheet(args.happy, "happy", args.output)
    export_sheet(args.angry, "angry", args.output)

if __name__ == "__main__":
    main()
