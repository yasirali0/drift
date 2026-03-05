# Drift — Copilot Instructions

Drift is a persistent browser-based ecosystem simulation (TypeScript + Three.js WebGL). A procedural island with 3D terrain, water, weather, plants, and evolving creatures runs continuously — including offline via time-warp fast-forward.

## Build & Run

```bash
npm install
npm run dev      # Vite dev server → http://localhost:5173
npm run build    # tsc + vite build
```

No test framework is configured. Validate changes manually in the browser.

## Architecture

Five subsystems compose the simulation, orchestrated by `DriftApp` in `src/main.ts`:

| Directory | Responsibility |
|-----------|---------------|
| `src/world/` | Terrain generation, water flow/erosion, weather, clock (seasons, day/night) |
| `src/life/` | Flora (grid-based plants), Fauna (creature manager), Creature (individual AI + genetics), Behavior (FSM), Genes (crossover/mutation) |
| `src/render/` | 2D-era modules (Colors palette, InspectorPanel, JournalPanel, PopulationGraph) — HTML overlay UI |
| `src/render3d/` | Three.js 3D renderer: TerrainMesh, WaterPlane, SkyLighting, CreatureMeshes, OrbitCamera, RainParticles, Renderer3D |
| `src/persistence/` | localStorage save/load, TimeWarp (offline fast-forward with narrative) |
| `src/utils/` | Seeded PRNG (`SeededRandom`), Perlin noise |

### Tick Order (critical)

Each `World.tick()` executes in this order — changing it breaks simulation invariants:

1. Clock → 2. Weather → 3. Rain (every 3rd tick) → 4. Water flow → 5. Erosion (every 100 ticks) → 6. Flora → 7. Fauna

### Game Loop

- **Simulation**: 1 tick/second (fixed timestep), each tick = 1 world-hour
- **Speed options**: 1x, 2x, 5x, 10x, 25x, 50x, 100x
- **Rendering**: 60 FPS via `requestAnimationFrame`, decoupled from simulation
- **Auto-save**: every 10 seconds + on page unload
- **Time warp**: triggers when >5 seconds elapsed since last save (cap: 200,000 ticks)

## Key Conventions

### Code Style
- **Class-based OOP** with composition (World owns Terrain, Water, Clock, etc.)
- **Numeric enums** for states and types (e.g., `CreatureState`, `PlantType`, `BiomeType`)
- **camelCase** for methods/properties, **SCREAMING_SNAKE** for constants
- **No frameworks or runtime dependencies** — keep it that way
- Strict TypeScript (`strict: true`, `noEmit: true`, bundler module resolution)

### Performance Patterns
- **Typed arrays** (Float32Array, Uint8Array, Uint16Array) for all grid data — never use plain arrays for grids
- **Row-major grid indexing**: always `array[y * WORLD_SIZE + x]`
- **Staggered updates**: Flora processes 1/4 of the grid per tick (`tickCounter % 4`)
- **Off-screen canvas**: world terrain rendered to buffer, composited onto main canvas
- **Frustum culling**: skip creatures outside camera viewport

### Genetics & Creatures
- 10 gene traits (speed, size, vision, metabolism, fertility, aggression, camouflage, colorR/G/B), each clamped [0, 1]
- Crossover: 50/50 per trait from two parents; mutation: 10% chance per gene, ±15% magnitude
- Creature FSM priority: **threat → hunger → reproduction**
- `Creature.resetIdCounter()` must be called before deserializing saved fauna

### Serialization
- State enums are stored as numbers — **never reorder enum variants** or saves will break
- Terrain heights are rounded (×10000, ÷10000) for localStorage compression
- Full roundtrip: `world.serialize()` → JSON → localStorage → `World.deserialize()`

## Pitfalls

- **Enum ordering is load-bearing**: reordering `CreatureState`, `PlantType`, or `BiomeType` breaks saved worlds
- **Grid index convention**: swapping x/y in `y * size + x` causes silent data corruption
- **Tick order matters**: flora must update before fauna (creatures eat plants grown this tick)
- **Creature ID counter**: static counter must be reset before deserialization to avoid ID collisions
- **Island falloff**: terrain height is reduced by distance from center — edges are always ocean
- **TimeWarp cap**: max 200,000 ticks (~11 hours real time); beyond that, time is skipped with a message
