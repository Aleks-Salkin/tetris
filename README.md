# Brickfall!

A jungle block-stacking game for the browser, styled as a homage to early-80s Atari cartridges and *Pitfall!*. It's written in plain HTML, CSS, and JavaScript with no build step. The art and sound are generated in code, so there are no image or audio files. The pixel font loads from Google Fonts.

Play it at https://aleks-salkin.github.io/tetris/

## Pieces

| Shape | Jungle item |
| --- | --- |
| I | Vine |
| O | Gold bar |
| T | Monkey |
| S | Alligator |
| Z | Water splash |
| J | Rolling log |
| L | Scorpion |

## Sound

The music is an original chiptune loop. It speeds up and adds layers as the level rises and the stack gets higher, and falls back when you clear the stack.

- A coin chime plays for a line clear or a snug fit that leaves no gaps.
- "Whomp WHOMP" plays when a piece buries two or more empty cells.

## Controls

| Key | Action |
| --- | --- |
| Left / Right | Move |
| Down | Soft drop |
| Up or X | Rotate clockwise |
| Z | Rotate counter-clockwise |
| Space | Hard drop |
| C or Left Shift | Hold |
| P or Esc | Pause |
| M | Sound on / off |

On phones and tablets, on-screen buttons appear below the board.

## Run locally

Open `index.html` in a browser.

## Deploy

GitHub Pages serves the `main` branch, so pushing to `main` publishes the site.
