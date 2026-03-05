# Drift — Copilot Instructions

Drift is a persistent browser-based ecosystem simulation (TypeScript + Three.js WebGL). A procedural island with 3D terrain, water, weather, plants, and evolving creatures runs continuously — including offline via time-warp fast-forward.

## Build & Run

```bash
npm install
npm run dev      # Vite dev server → http://localhost:5173
npm run build    # tsc + vite build
```

No test framework is configured. Validate changes manually in the browser.

Dependencies: `three` (^0.183.2), `@types/three`. No other runtime deps — keep it that way.

## Architecture

Six subsystems compose the simulation, orchestrated by `DriftApp` in `src/main.ts`:

| Directory | Responsibility |
|-----------|---------------|
| `src/world/` | Terrain generation (512×512), water flow/erosion, weather, clock (seasons, day/night), EventJournal |
| `src/life/` | Flora (grid-based plants), Fauna (creature manager), Creature (individual AI + genetics), Behavior (FSM), Genes (crossover/mutation) |
| `src/render3d/` | Three.js 3D renderer: TerrainMesh, WaterPlane, SkyLighting, CreatureMeshes, VegetationMeshes, OrbitCamera, RainParticles, Renderer3D |
| `src/render/` | HTML overlay UI: PopulationGraph, InspectorPanel (creature details), JournalPanel (event log), Colors palette. Legacy Camera.ts/Renderer.ts are deprecated |
| `src/audio/` | Procedural Web Audio API — 5 synth layers (wind, rain, birds, crickets, water), no audio samples |
| `src/persistence/` | localStorage save/load, TimeWarp (offline fast-forward with narrative) |
| `src/utils/` | Seeded PRNG (`SeededRandom`), Perlin noise |

### Tick Order (critical)

Each `World.tick()` executes in this order — changing it breaks simulation invariants:

1. Clock → 2. Weather → 3. Rain (every 3rd tick) → 4. Water flow (every 2nd tick) → 5. Erosion (every 100 ticks) → 6. Flora → 7. Fauna → 8. Journal (every 120 ticks)

### Game Loop

- **Simulation**: 1 tick/second base rate (accumulator-based), each tick = 1 world-hour
- **Speed options**: 1x, 2x, 5x, 10x, 25x, 50x, 100x (max 200 ticks/frame cap)
- **Rendering**: 60 FPS via `requestAnimationFrame`, fully decoupled from simulation ticks
- **Auto-save**: every 10 seconds + on page unload
- **Time warp**: triggers when >5 seconds elapsed since last save (cap: 200,000 ticks)

### Render Update Cadence

Not everything updates every frame — staggering is intentional for performance:
- **Creature meshes**: every frame (position, rotation, color)
- **Water animation**: every frame (shader uniforms)
- **Audio**: every frame (synth parameter ramping)
- **Terrain vertex colors**: every 10 frames (biome, flora, water, daylight, rain)
- **Vegetation meshes**: every 30 frames (sample every 2nd cell)

## Key Conventions

### Code Style
- **Class-based OOP** with composition (World owns Terrain, Water, Clock, etc.)
- **Numeric enums** for states and types (e.g., `CreatureState`, `PlantType`, `BiomeType`)
- **camelCase** for methods/properties, **SCREAMING_SNAKE** for constants
- Strict TypeScript (`strict: true`, `noEmit: true`, bundler module resolution)

### Three.js Patterns
- **InstancedMesh** for all repeated geometry (creatures, vegetation) — never individual meshes
- Set `instancedMesh.count` before render; set `needsUpdate = true` on instanceMatrix/instanceColor after changes
- **Custom ShaderMaterial** for water (depth coloring, edge fade) and sky dome (gradient + procedural clouds)
- Shader uniforms (`uTime`, `uDaylight`, etc.) for real-time animation
- **Raycasting** on InstancedMesh for creature selection; `instanceId` maps to creature ID arrays
- `HEIGHT_SCALE = 50` — all terrain vertex Y positions and 3D placements use this multiplier
- `SEA_LEVEL_H = 0.35` — water plane fixed height; creatures spawn above it

### Performance Patterns
- **Typed arrays** (Float32Array, Uint8Array, Uint16Array) for all grid data — never plain arrays for grids
- **Row-major grid indexing**: always `array[y * WORLD_SIZE + x]` where `WORLD_SIZE = 512`
- **Staggered updates**: Flora processes 1/4 of the grid per tick (`tickCounter % 4`)
- **Vegetation sampling**: every 2nd cell to avoid overdraw at high density
- **Instance caps**: creatures 1400, trees 10k, bushes 7k, grass 12k, flowers 6k, rain drops 3k

### Audio Patterns
- Web Audio API initialized on first user gesture (autoplay policy)
- Master gain 0.35; 5 independent synth layers with `setTargetAtTime()` for smooth ramping
- Procedural noise generation (white noise → brown noise via integration)
- Layers activate based on time-of-day, weather, and season

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
- **HEIGHT_SCALE = 50**: changing this breaks camera positioning, creature placement, and water plane alignment
- **SEA_LEVEL_H = 0.35**: water plane height; changing breaks terrain/water visual coherence
- **InstancedMesh.count**: must be set before render; stale count shows invisible or ghost instances
- **Three.js version lock**: `@types/three` must match `three` version; breaking changes across 0.18x
- **Audio autoplay**: context must be resumed on user gesture; calling `init()` before interaction is silent
