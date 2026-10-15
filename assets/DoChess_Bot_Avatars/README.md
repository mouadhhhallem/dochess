# DoChess Bot Avatars

Each folder contains six individual PNGs in the same bot order:

1. `bot-1.png` — top-left, red frame
2. `bot-2.png` — top-middle, purple frame
3. `bot-3.png` — top-right, teal frame
4. `bot-4.png` — bottom-left, cyan frame
5. `bot-5.png` — bottom-middle, gold frame
6. `bot-6.png` — bottom-right, yellow frame

Folders:
- `straight/` — neutral/straight expressions
- `happy/` — happy/celebratory expressions
- `angry/` — angry/losing expressions
- `source-sheets/` — original full sheets for reference

All individual portraits are 390 × 484 pixels and preserve the original artwork without stretching.
The crop script requires Pillow: `python -m pip install Pillow`

Example:
`python split_bot_avatars.py --straight source-sheets/straight-sheet.png --happy source-sheets/happy-sheet.png --angry source-sheets/angry-sheet.png --output DoChess_Bot_Avatars`
