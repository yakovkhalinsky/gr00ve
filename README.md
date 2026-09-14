# gr00ve

A generative multi-track sequencer: algorithmic melody generation, driven by
sliders and encoders.

The design is the output of a research pass — algorithms, interface prior art,
control surfaces, and the musical conventions of electronic music. That research
is in **[docs/research-brief.md](docs/research-brief.md)**, and it is worth
reading before changing anything here, because most of the non-obvious decisions
in this repo come from it.

**Status: scaffold.** The generation core is real and tested. The audio engine
and MIDI layers are skeletons with the hard parts researched and documented. The
UI is functional but not wired to the scheduler.

## Quick start

```bash
make install      # pnpm workspace, one lockfile
make dev          # web app at http://localhost:5273
make ci           # lint + build + test across every project
make test         # just the tests
```

`make` on its own lists the discovered projects and available targets.

## Layout

| Path | What |
|---|---|
| `packages/core` | Generation, pattern model, music theory. **Pure** — no DOM, no audio, no MIDI. |
| `packages/audio` | Lookahead scheduler, transport, swing, polymeter. |
| `packages/midi` | Web MIDI, encoder/fader semantics, device SysEx (Novation, Akai). |
| `apps/web` | React 19 + Vite UI. Targets **Chrome**. |
| `docs/research-brief.md` | The research, the reasoning, and what could not be verified. |

The `core` split is deliberate: keeping musical logic away from the audio thread
and the render loop is what makes the generators testable without a browser, and
lets the same code drive a Web Audio app, an offline renderer, or a MIDI-only
headless build.

## Conventions

Matches `~/git/0d3sa`: Node 24 with native TypeScript type-stripping, ESM,
`module: NodeNext`, pnpm workspace with one root lockfile, and a `Makefile` in
every project exposing the same optional targets:

| Target | Meaning |
|---|---|
| `install` | Resolve dependencies. For JS this is root-level and a per-project no-op. |
| `build` | Emit to `dist/`. |
| `test` | Run the suite. **Needs no dependencies installed.** |
| `lint` | Type-check, tests included, without emitting. |
| `fmt` | Format, where configured. |
| `check` | `lint build test`. |
| `clean` | Remove build artifacts. |

`make ci` is `lint build test`. `STRICT=1` turns a project's missing target from
`SKIP` into a failure. `PKG="a b"` restricts the fan-out.

TypeScript is strict beyond the usual: `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `erasableSyntaxOnly`, `verbatimModuleSyntax`.
Two consequences that bite:

- `erasableSyntaxOnly` **forbids constructor parameter properties**. Declare
  fields explicitly.
- `exactOptionalPropertyTypes` means `{ x?: T }` will not accept an explicit
  `undefined`. Write `{ x: T | undefined }` when it can be present-but-undefined.

## Testing strategy

Pure logic runs under `node --test` with no browser and no mocks — that is 104
tests today and the bulk of what matters.

Anything touching Web Audio or Web MIDI needs a real browser. The intended split
is `OfflineAudioContext` under Vitest for DSP and scheduling maths (deterministic
and headless), and Playwright for smoke tests. Note that headless Chromium still
has no audio device, so assert on graph and scheduling *state*, not on sound.

## Two things to know before touching the timing code

1. **Time is rational, never floating point.** Swing, triplets and per-track
   polymeter divide time into thirds and sevenths, which binary floats cannot
   represent exactly. `fraction.ts` normalises by the GCD so a triplet grid stays
   phase-locked to the bar indefinitely. There is a subtlety: a swing ratio
   arrives as a float, so it must be *approximated* by continued fractions rather
   than scaled — scaling `2/3` gives `667/2000`, a different rhythm that drifts.
2. **Generators take a seeded `Rng`, never `Math.random`.** Reproducibility is a
   requirement: the performer turns an encoder, hears something they like, and
   must be able to return to it. State is a plain number you can store and recall.

## Next steps

See §9 of the brief. The first decision to settle is **8 encoders or 24** — the
two research passes disagree, and it gates the whole control-surface mapping.
