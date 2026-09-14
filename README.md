# gr00ve

A generative multi-track sequencer: algorithmic melody generation, driven by
sliders and encoders.

The design is the output of a research pass — algorithms, interface prior art,
control surfaces, and the musical conventions of electronic music. That research
is in **[docs/research-brief.md](docs/research-brief.md)**, and it is worth
reading before changing anything here, because most of the non-obvious decisions
in this repo come from it.

**Just want to play it?** The user guide is at **[/gr00ve/guide.html](https://yakov.khalinsky.com/gr00ve/guide.html)**
— a five-minute tour, then a reference for every control. It is rendered from
[docs/using-gr00ve.md](docs/using-gr00ve.md) at build time, so the markdown a
contributor edits and the page a musician reads are the same file.

**Live demo:** <https://yakov.khalinsky.com/gr00ve/>

> Use the **https** URL above. The `github.io` address redirects over plain
> `http`, and Web MIDI needs a secure context — so arriving that way would
> silently disable MIDI. (The domain's HTTPS enforcement is a setting on the
> user-level Pages site, not this repo.)

**Status: playable.** Press Play and it makes sound. The generation core and
the audio engine are real and tested; MIDI input is implemented but not yet
bound to the UI.

### What the demo does and doesn't do

**Works:** **Play.** The first four tracks are a drum kit, the last four are
melodic and polymetric against it. Plus **voice/rhythm** switching, toggling
steps, dragging knobs (relative drag — no jump on grab), Shift for fine adjust,
arrow keys, double-click to type a value, switching scales, per-track loop
length, and **E(k,n)** — click a track's `E(5,8)` button to write a Euclidean
pattern into it. Underneath it, **Clear** empties that track's steps.

The **twelve pitch faders drive generation**: they decide which notes E(k,n)
writes. Moving a fader and pressing E again gives a different phrase.

**MIDI out** drives external gear: one MIDI channel per track, timestamped note
on/off, and optional 24 ppqn clock. Built for a MIDI-to-CV module in a Eurorack
rig — see the guide for what the defaults assume.

> **Every generate and every Clear is recoverable.** Each track keeps a short
> history of its steps — step through it with the `‹ 3/7 ›` control beside the
> generate button. What is *not* recorded is editing: step toggles and loop-length
> changes are live, so stepping through versions will replace them.

**Doesn't:**

- **No MIDI input.** The mapping semantics (encoder relative modes, fader
  pickup) and the Launch Control XL 3 / APC mini mk2 SysEx are implemented and
  tested in `@gr00ve/midi`, but nothing is bound to the UI — a controller
  plugged in does nothing. MIDI *output* works.
- **MIDI channels are fixed at 1:1** with track index. Per-track channel
  assignment is the obvious next step for a rack that isn't wired that way.
- **Track register isn't exposed.** Each track carries a semitone offset applied
  to the mixer's pitches, seeded per track so eight tracks don't all generate in
  one octave — but there is no control for it yet.
- **Drum tuning isn't exposed.** `DrumParams` carries `tune` and `decay`
  multipliers and `DrumVoice` honours both, but every drum plays at its designed
  tuning — two encoders per rhythm track is the obvious next step.
- **Resonance-coupled accent is not modelled** — see the note in
  `packages/audio/src/index.ts`. It is the highest-value next addition to the
  voice.

### How generation composes

**Euclidean answers *when*. The pitch mixer answers *what*.** Neither tries to
do the other's job, and `generateCells` in `apps/web/src/state/store.ts` is the
one place they meet.

That split is load-bearing. The mixer has a rest probability of its own, and
applying it on top of a Euclidean mask would punch holes in a rhythm the
performer deliberately dialled in — which reads as the Euclid generator being
broken. So when a gate is supplied, the gate owns *when*: `restProbability` is
ignored, and accents follow the metre rather than the mix's accent probability,
because accent placement is part of a rhythm rather than part of a pitch choice.

Two consequences worth knowing:

- **Every generate gives a new phrase, and every phrase is reproducible.** Each
  track stores a seed that advances on each press of E, so pressing it
  repeatedly varies the pattern instead of returning the same one. The seed plus
  the current mixer fully determines the notes, so a phrase can be returned to.
  An earlier version derived the seed from the parameters alone, which made
  generate idempotent — reported from use as "the E(k,n) button doesn't work",
  which was the correct reading: a generate button that does nothing when
  pressed is broken, however defensible the reasoning. Surfacing the seed as a
  control is the researched next step (Marbles' DEJA VU, the Turing Machine's
  mutation knob).
- **Pitches are snapped into the scale**, so a weighted semitone that falls
  between scale notes lands on the nearest one rather than being discarded. The
  chromatic faders plus a quantiser is what the hardware does. It also means a
  semitone weight is not an exact semitone: weighted a fifth, you get the
  nearest in-scale note. An octave survives untouched, which is why the tests
  use octave weights when they need an exact interval.
- **The default mixer's octave weights are deliberately narrow.** A third
  octave put G5 in the same bar as C3 — a 2.5-octave leap inside one line —
  against the brief's finding that an electronic melody occupies about 1–1.5
  octaves. Worst case is now 22 semitones. The span is set by the *weights*, not
  enforced by the generator, which is the mixer doing its job.

### Voice and rhythm tracks

A track is either a **voice** (pitched, drawing notes from the scale) or a
**rhythm** (unpitched, playing one percussion sound per step). Switch with the
mode button; rhythm tracks also get a drum picker.

Two properties worth preserving if you change this:

- **The step's `pitch` is ignored on a rhythm track but not cleared.** Switching
  a track to rhythm and back returns the melody rather than an empty grid — a
  mode toggle that quietly destroys the part would be a trap.
- **The engine doesn't branch per step.** Both instruments satisfy `Instrument`,
  and a drum simply ignores the frequency and glide it's handed. A drum reports
  `isSoundingAt() === false`, which is what makes a slide on a rhythm track
  inert without any special-casing.

Drums are **synthesised, not sampled** — a kick is a sine dropping fast from
150Hz to 45Hz, a snare is noise plus a tuned body, a hat is high-passed noise.
That's how the 808/909 actually work, so it's recognisable, and it avoids
shipping or licensing audio files. The noise source is a seeded PRNG rather than
`Math.random`, so renders are reproducible and therefore testable.

### How the audio works

`SequencerEngine` owns one `AudioContext`, one 303-ish monophonic voice per
track, and a lookahead scheduler (100ms window / 25ms interval). Two details are
worth knowing before changing it:

- **The engine is constructed inside the Play click's call stack.** Browsers
  refuse to start an `AudioContext` outside a user gesture, and the failure is
  *silent* — the context just stays suspended. Moving that into an effect breaks
  audio with no error.
- **The playhead is released on the audio clock, not at schedule time.** The
  scheduler runs 100ms ahead, so notifying the UI when a step is *scheduled*
  makes the highlight visibly lead the sound. Steps are queued with their
  `AudioContext` times and released when the clock reaches them.

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

Pure logic runs under `node --test` with no browser and no mocks — the bulk of
what matters.

**The audio is actually rendered and measured**, rather than assumed.
`node-web-audio-api` provides a real Web Audio implementation in Node, so
`voice.offline.test.ts` renders the voice through an `OfflineAudioContext` and
asserts on amplitude, brightness, and envelope continuity. That is what catches
a voice that schedules silently — a failure invisible to type-checks, builds and
green test runs.

Two lessons from writing those tests, both of which cost real time:

- **Zero-crossing rate cannot tell a gain change from a filter change.** A
  sawtooth through a lowpass crosses zero at the same indices at any gain, so
  ZCR reports them identically — which is exactly the distinction an accent test
  must make. Use mean |Δsample| / RMS instead.
- **An accent is a transient.** Its filter effect is short by design, so
  averaging brightness over a whole note can make an accented note measure
  *darker* than a plain one. Measure peak brightness in short windows.

`node-web-audio-api` is an optional dev dependency: the offline tests skip
cleanly if it is not installed, so `node --test` still works with nothing
installed.

Still uncovered: `engine.ts` and `scheduler.ts` construct their own
`AudioContext` and use `requestAnimationFrame`, so they are not reachable from
the offline harness. Their logic is covered via `timeline.ts` (pure, tested) and
the rest is exercised by driving the app.

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
