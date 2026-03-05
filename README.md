# Drift

**A persistent generative world that evolves while you're away.**

Drift is an artificial ecosystem simulation that runs in your browser. It generates a procedural island with terrain, water, weather, and plant life — and it keeps changing even when you close the tab. When you return, you discover what happened in your absence.

## The Idea

Most simulations pause when you stop watching. Drift doesn't.

Close your tab for an hour, and when you return, years have passed in the world. Forests have grown or receded. Rivers have shifted course. Seasons have cycled dozens of times. The world doesn't need you — but it rewards you for coming back.

## Features

- **Procedural terrain** — Unique island generated from a random seed with oceans, beaches, grasslands, forests, mountains, and snow
- **Dynamic water** — Rain fills valleys, water flows downhill, erosion slowly reshapes the landscape over centuries
- **Living flora** — Grass, flowers, bushes, and trees grow, spread, compete, and die according to biome, season, and conditions
- **Weather & seasons** — Rain systems roll through, temperatures shift, and the cycle of spring through winter shapes all life
- **Day/night cycle** — Watch dawn break and dusk fall, with lighting that transforms the entire palette
- **Time warp** — Close the tab, come back later, and discover what happened while you were away. A narrative log tells the story
- **Persistent state** — Your world is saved automatically and survives page refreshes

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Controls

| Input | Action |
|-------|--------|
| Drag  | Pan the camera |
| Scroll | Zoom in/out |
| `R` | Generate a new world |
| `P` | Pause/unpause simulation |

## Time Scale

| Real Time | World Time |
|-----------|-----------|
| 1 second  | 5 hours |
| 1 minute  | 12.5 days |
| 1 hour    | ~6 years |
| 1 day     | ~150 years |

Leave for a weekend and return to find centuries of ecological change.

## Roadmap

This is a living project. Planned features:

- [ ] **Fauna** — Creatures with neural-network brains that evolve via natural selection
- [ ] **Ecosystems** — Predator-prey dynamics, food webs, symbiosis
- [ ] **Geology** — Volcanic activity, earthquakes, tectonic drift
- [ ] **Civilizations** — Emergent settlements, trade routes, recorded history
- [ ] **Sound design** — Ambient audio reflecting the world's state
- [ ] **3D rendering** — WebGL terrain with real elevation
- [ ] **Multiplayer** — Shared persistent worlds
- [ ] **Export & share** — Save and share interesting worlds as seeds

## Philosophy

Drift is an exploration of persistence, emergence, and the observer effect in digital systems. Does a simulated world have meaning if nobody watches? What happens when simple rules produce complex behavior over vast timescales?

The answer is: something beautiful.

## Tech

TypeScript + HTML5 Canvas. No frameworks, no runtime dependencies. Just math, time, and pixels.

## License

MIT
