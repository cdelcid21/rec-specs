# Rec Specs

A PWA for U8 soccer coaching. Manage player lineups and track play time during games — installable on iOS and Android, works fully offline.

## Features

- **Lineup setup** — tap jersey numbers (0–30) to add players to your roster
- **Drag-and-drop field** — place players into 7 positions (3 FWD, 3 DEF, 1 GK) or leave them on the bench
- **Live play-time tracking** — the app tracks cumulative time per player and per position group automatically
- **Sub hints** — players who need the most time are highlighted for easy substitution decisions
- **Halftime & fulltime reports** — summary of each player's minutes and position breakdown
- **Draw mode** — sketch formations and drag tokens freely for tactical planning
- **Screen stays on** — uses the Wake Lock API so your screen doesn't dim during a game
- **Offline support** — fully cached via Service Worker after first load

## Gestures

| Gesture | Action |
|---|---|
| Tap a jersey number | Add/remove player from roster |
| Drag a player token | Move between field positions or bench |
| Press and hold (field) | Reveal cumulative play times and sub hints |
| Press and hold (timer) | Reset the game |
| Tap draw mode icon | Toggle tactical draw mode |
| Drag in draw mode | Move tokens freely around the field |
| Freehand on canvas | Sketch lines and formations |

## Game Flow

1. **Setup** — select jersey numbers for all players on the roster, then tap **Start Game**
2. **First half** — drag players into positions, start the timer; swap subs as needed
3. **Halftime** — tap the halftime button for a play-time report, then set up for the second half
4. **Full time** — tap the fulltime button for the final play-time summary

## Installation (PWA)

**iOS (Safari):** Open the app URL → tap the Share icon → "Add to Home Screen"

**Android (Chrome):** Open the app URL → tap the browser menu → "Add to Home Screen" or "Install App"

Once installed, the app runs standalone (no browser chrome) and works without a network connection.

## Tech

Vanilla HTML/CSS/JS — no build tools, no dependencies. A single `index.html` file plus a Service Worker for offline caching.
