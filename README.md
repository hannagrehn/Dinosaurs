# 🦖 Dinosaurs

A little arcade of prehistoric games and Java experiments, all dinosaur themed. Everything in this repo runs standalone — no build step, no dependencies, no server required (unless noted).

## Play the games

Open [`index.html`](index.html) in your browser for a hub linking to everything below, or jump straight into a game:

| Game | Description |
| --- | --- |
| [DinoHat](DinoHat/index.html) | Multiplayer hat game: fill the hat with catchphrases, then race the clock to guess who said what. Requires the [DinoHat server](#dinohat-server) to be running. |
| [DinoMemory](DinoMemory/index.html) | Classic memory match with 16 dino-themed cards. Fewer moves and less time means a better score. |
| [DinoSnake](DinoSnake/index.html) | Snake, but the head is a dinosaur. Chomp eggs, grow longer, don't hit the walls or your own tail. |
| [DinoWordle](DinoWordle/index.html) | Wordle with a prehistoric twist — guess the 5-letter dino-world word in 6 tries. |

### DinoHat server

`DinoHat/DinoHat.java` is the backend for the DinoHat game (rooms, players, clues, timers). Compile and run it, then open `DinoHat/index.html` through that server:

```powershell
cd DinoHat
javac DinoHat.java
java DinoHat
```

DinoMemory, DinoSnake, and DinoWordle are fully static and can be opened directly as files — no server needed.

## Other dino stuff

- `TRex.java` — an ASCII T-Rex that runs back and forth in your terminal.
- `trex-ascii.txt` — a standalone ASCII T-Rex.
- `DinoWine.java` — a Java program.
- `dinosaurs.txt` — quick facts about famous dinosaur species.
- `highscore.txt` — a saved high score.

## Tech

Plain HTML, CSS, and vanilla JavaScript for the browser games; plain Java for `DinoHat`, `TRex`, and `DinoWine`. No frameworks, no package managers.
