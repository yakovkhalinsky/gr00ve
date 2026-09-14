# gr00ve — research brief

**Electronic music melody generation, and the interface to drive it**

Compiled 2026-09-14. Eight parallel research passes: algorithmic generation, ML
generation, transform operators, interface prior art, TypeScript stack, hardware
platforms, electronic-music domain knowledge, and the Novation and Akai
controller lineups.

---

## 1. The recommendation

**Build a TypeScript/React web app that generates melodies algorithmically, and
drive it with a Novation Launch Control XL 3 (~$230) plus an inexpensive RGB pad
grid, targeting Chrome.**

The reasoning, in the order it matters:

1. **Algorithmic generation, not ML.** Not because ML is bad, but because the
   interface mismatches. ML generation takes seconds and is non-deterministic —
   a re-render is never the same — and only about five of its parameters map to
   a continuous control. A performer turning an encoder expects 16th-note
   causality. Algorithmic generators are instant, seeded, reproducible, and
   *every* meaningful parameter is a knob. ML belongs as a deliberate, opt-in
   "surprise me" button, not as the instrument.

2. **The pitch-probability mixer is the centre of gravity.** Twelve faders, one
   per semitone, each setting how likely that pitch is. No corpus, no training,
   nothing to be surprised by, and it does three jobs with one mechanism —
   generator, arpeggiator, quantiser. It is exactly how the Vermona meloDICER
   and Stochastic Inspiration Generator work, and it is the best
   interface-to-algorithm fit in the entire survey.

3. **Sliders for what never changes meaning; encoders for what does.** The
   TB-303 — the most-copied melodic interface in electronic music — is six
   knobs, sixteen steps, four booleans per step. EDM's expression lives in
   timbre and gesture (filter, accent, slide, gate), not in pitch-set structure.
   That split is also what the interface research concludes independently, from
   hardware that got it right and hardware that didn't.

4. **The Launch Control XL 3 is the only off-the-shelf surface that fits.**
   Twenty-four *endless* encoders with host-drivable RGB rings means three live,
   visibly-stateful parameters per track across eight tracks with no paging and
   no page-switch jumps. Nothing in Akai's current line matches it at any price.

5. **It has one real gap, and it is cheap to fill.** No per-step LED grid. An
   **Akai APC mini mk2 ($85)** fills it — and it is the only Akai controller
   whose LEDs a host app can drive with true arbitrary RGB.

---

## 2. Method, and how much to trust this

Eight agents, each instructed to prefer primary sources — papers, manuals,
vendor SysEx documentation, owner forums — over marketing copy. Findings were
cross-checked where agents overlapped.

**Confidence is not uniform, and the weak parts are flagged rather than
smoothed over:**

| Area | Confidence | Notes |
|---|---|---|
| Generation algorithms | **High** | Primary papers + hardware manuals |
| Interface principles | **High** | Manuals, panel photos, owner forums; quotes are traceable |
| Electronic-music domain | **High** | Standard texts (Butler, Snoman) + track deconstructions |
| TypeScript stack | **High** | Registry and repo state checked directly |
| Hardware platform | **Medium** | 2026 pricing volatile |
| Novation XL 3 | **High** | Programmer's Reference Guide read directly |
| Akai lineup | **Medium-high** | Protocol PDFs read directly; US MSRP unavailable |

**Known limits of this research:**

- **The session's WebSearch quota was exhausted (200/200).** Later findings came
  from direct page fetches. Reddit and Gearspace returned HTTP 403, so forum
  sentiment skews Elektronauts and Modwiggler. No Sound on Sound review of the
  Hapax, Torso T-1, Polyend Play+ or MPC Live II was obtainable.
- **Three vendor specs are actively distrusted:** Novation's Circuit Tracks page
  claims "24 endless encoders" where the hardware and its own user guide say 8;
  Push 3's encoders are assumed to have LED rings but no source confirms it;
  Polyend's Play+ marketing says "9 endless encoders" where the hardware is 15
  knobs plus a screen encoder.
- **Unverified:** Polyend Play screen resolution; whether the MC-707's per-track
  knobs are pots or encoders; whether Push 3's encoders are detented; the exact
  MPC Live III Q-Link count.
- **Not surveyed at all:** Squarp Pyramid, Roland MC-101, Akai Force, Elektron
  Model:Cycles/Samples, Korg SQ-1/64, Arturia BeatStep Pro, Erica Synths Black
  Sequencer.
- **One correction to the brief's own inputs:** an early prompt asked about
  "Ornstein & Johnson's melody model". That citation does not exist — the model
  in question is the mean-reverting **Ornstein–Uhlenbeck** process as applied by
  Brown & Gifford. The right thing to build is the same either way.
- **Prices are ±10%.** The Launch Control XL 3 is **$229.99**, not the $249.99
  quoted at launch. Akai US MSRP could not be verified — every major US retailer
  returned 403 to a non-browser client — so Akai prices are Thomann USD.

---

## 3. Part 1 — Melody generation

### 3.1 The test that decides everything

For a sliders-and-encoders instrument, the question is not "which algorithm is
smartest" but:

> **Does the algorithm have a parameter whose musical meaning a performer can
> hear while turning it?**

Euclidean `k` and `n` pass. A 12-semitone probability fader passes. Grammar
derivation depth does not. Xenakis sieve formulas — where the parameter is a
*formula string* — do not.

### 3.2 Ranked shortlist

| # | Generator | Why | Status in repo |
|---|---|---|---|
| 1 | **Euclidean / Bjorklund** | Two encoders, unconditionally legible, ~30 lines, sounds like music on the first turn. Tresillo and cinquillo fall out. The industry's default rhythm engine. | `core/src/gen/euclid.ts` |
| 2 | **Weighted pitch-probability mixer** | Best interface-to-algorithm fit in the survey. Zero weight removes a pitch, so no separate enable. Doubles as arpeggiator and quantiser. | `core/src/gen/pitch-mixer.ts` |
| 3 | **Shift register + mutation probability** | Two knobs, bit-exact reproducible. The cleanest hardware expression of *evolve rather than re-roll* — turn mutation up, it drifts; turn it down, it locks. | `core/src/gen/turing.ts` |
| 4 | **Mean-reverting random walk** | The "comprehensible melody" model. Four parameters, all legible: leap size, centre, gravity, directional bias. Trance leads rise — bias is not decorative. | `core/src/gen/walk.ts` |
| 5 | **Logistic map** | Most chaos makes bad instruments. This one is the exception: `r` sweeps audibly through a period-doubling cascade, so the knob has audible structure, not just noise. | `core/src/gen/chaos.ts` |
| 6 | **1D cellular automaton as a mask** | Not a melody generator — a *pattern* generator. Rule number is a 256-value encoder, and the grid it produces is the same shape as the sequencer display. | not built |
| 7 | **Variable-order Markov** | The only approach that delivers "it plays in my style". Requires a phrase-capture UI, so v2 — but constraint it from day one, because *unconstrained* high-order Markov hands back the training phrase verbatim. | not built |

**Elegant but musically useless in practice** — GTTM/Steedman grammars
(analysis, not generation: preference rules are a scoring function, not knobs),
Game of Life (uncontrollable density; 1D CA strictly dominates it), harmony
search / GA / simulated annealing (there is no objective function in live use,
so the parameters are *job* parameters, not musical ones), Xenakis sieves, and
the Lorenz attractor (3D, arbitrary pitch mapping).

### 3.3 The single highest-leverage design idea

**Marbles' "DEJA VU": one knob for recycle probability** — "how much of the past
do we reuse" — queried by *every* generator before it makes a random decision.

This is the answer to reproducibility as a single control, and it is worth
building as a global primitive rather than per-generator. Its cousin is the
Turing Machine's mutation-probability knob, which is bit-exact reproducible
because the loop *is* the state.

Two more UX primitives worth stealing outright:

- **meloDICER stores parameters, not sequences** — so a recalled pattern stays
  editable, rather than being a frozen recording.
- **meloDICER's DICE round-trip**: holding DICE switches to continuous
  generation; returning to dice mode restores the *exact* previous pattern.

### 3.4 ML generation: verdict

**Do not make it the primary path.** The blocker is not model quality:

- **Only ~5 parameters genuinely map to a continuous control**: temperature,
  top-p, classifier-free guidance scale, infill span length, and the
  Anticipatory Music Transformer's anticipation interval δ (which is genuinely
  musical — it controls how tightly a part locks to the lead).
- **No symbolic music model ships as ONNX or in transformers.js.** You would be
  the first to export one; budget 2–4 weeks of tokenizer and graph work. Best
  candidate is **MIDI-RWKV (~35M params, MIT)** — roughly 35MB at int8.
- **Audio-domain ML is a demo, not an instrument**: Stable Audio Open Small
  in-browser is 683MB and hits WebGPU buffer-allocation failures; ACE-Step is a
  5.2GB INT4 download.
- **Licensing landmines**: MusicGen's *weights* are CC-BY-NC-4.0 (fine to
  tinker, disqualifying commercially). Suno and Udio have **no public API**
  despite the July 2026 announcement. Magenta is effectively dead — the Python
  repo was archived January 2026 and `@magenta/music` has not published in
  about three years.
- **Fine-tuning is tractable but server-side.** On a 99-song single-composer
  corpus, state tuning (294K params, ~4 minutes) beat LoRA on content
  preservation *and* won a 28-participant listening test.

If ML is added: **symbolic, MIDI-RWKV-scale, and asynchronous** — a "surprise
me" button that drops a phrase into the pattern.

---

## 4. Part 2 — What makes it sound electronic

Algorithm choice does not make output sound electronic. Domain constraints do.

### 4.1 The melody carrier shifts by genre

"Melody generation" means something different in each genre, which argues for
**per-track generator choice** rather than one global algorithm.

| Genre | Tempo | What carries the melody | Mode |
|---|---|---|---|
| Chicago/Detroit house | 115–130 | Piano/synth riffs, string stabs; bass register matters more than a top line | Minor |
| Techno | 120–150 | Often none — arpeggiated chord tones, stabs, ostinati | E minor; **Dorian** for pads |
| Acid | 118–150 | The 303 line *is* the melody, functioning as texture | Dorian, Phrygian |
| Trance | 125–150 | Supersaw lead + arpeggios; **the 9th is the genre's colour** | A minor, F minor |
| IDM | ~170 | Monophonic counterpoint, no chords, micro-timed | Db minor |
| Drum & bass | 170–180 | Sub-bass; the Reese is the harmonic carrier | F, A, E, G minor |
| UK garage | 130–138 | Pitch-shifted vocal chops played like an instrument | Minor; **60–65% swing** |
| Synthwave | 80–118 | Continuous 16th-note saw arpeggio from chord tones | A/D minor |
| Modern bass | 135–142 | Warping Reese, or a sampled M1 organ stab | Minor, Phrygian |

**The unifying finding:** tempo and scale cluster by scene, but phrase structure
converges almost universally on the **8-bar loop** with 2- and 4-bar sub-units.
Variation is delivered by *production* — filter, accent, slide, timbre,
micro-timing, layer add/remove — **not by new melodic material.**

### 4.2 Hard constraints for plausibility

- **Minor or modal, almost never functional major.** Ionian reads as "too
  happy". Dorian, Phrygian and Aeolian cover nearly the whole field. "99.9% of
  techno is minor."
- **Melody occupies ≲1–1.5 octaves.** Not poverty but placement: the lead must
  sit above the bass and below the cymbal wash.
- **8-bar loop from 2/4-bar sub-units**, 16-step core motif.
- **Repetition is the default; variation is a low-probability per-pass event** —
  one note, one accent, one gate length.
- **Harmony, if present, is a 2–4 chord modal vamp**, not functional harmony.
  Voice leading barely applies because there is rarely a second simultaneous
  line to lead *to*; parallel motion, ostinato and pedal point replace it.
- **Rhythm and timbre do the work pitch does elsewhere.**
- **Odd motif lengths and per-step probability** are what keep a loop from
  becoming monotonous at bar 32.

Mark Butler's framing is the anchor: EDM "differs from most other types of
Western music in its rejection of harmony as a primary musical parameter", and
"The majority of musical development takes place instead in the realms of
rhythm, meter, texture, and timbre."

### 4.3 The TB-303 as a parameter model

The 303 is a design template worth copying precisely, and two details are
routinely got wrong:

- **Slide is a property of the *next* note.** The flag programmed on step *n* is
  consumed by step *n+1*: the slid note's gate ties into the following note, and
  CV changes without a new gate event. The implementation ordering is
  `s1 = s0; s0 = slide_flag;` then `note_on(note, slide=s1, accent)`. This is
  also what breaks naive MIDI voice allocators — two same-pitch notes at
  different accents need a Modified-MVA allocator (duplicate pitches allowed,
  release oldest-first).
- **Accent is resonance-coupled.** It drives both the VCA and, via the Accent
  Sweep Circuit (diode + 47k + 1µF), the filter. With repeated accents that
  capacitor "has not discharged fully", so successive peaks climb — the classic
  screaming acid. Cheap to model, and it is most of the character.
- **Gate is 3.5 of 6 clock pulses ≈ 58% duty cycle** — a good default.
- **Open303** (MIT, C++) is the DSP reference; **JC-303** is the JUCE port.

Six continuous controls, sixteen steps, four booleans per step. That is a
sliders-and-encoders instrument, and it is why the genre research and the
interface research reach the same conclusion independently.

### 4.4 The convergence

Both lines of research arrive at the same split, from opposite directions:

> **Continuous sliders → the timbre and gesture layer** (filter, resonance,
> env mod, decay, slide time, accent amount, density, swing, gate length).
> **Discrete encoders → the pitch-set and structure layer** (root, mode, motif
> length, contour, variation mode, per-step probability).

The domain research says this is where EDM's expression lives. The interface
research says it is what stops a performer losing track of what a control means.
The 303 says it is what shipped in 1981.

---

## 5. Part 3 — Interface

### 5.1 The core principle

**Faders own the parameter that never changes meaning. Encoders own everything
else.** A fader's position *is* the datum: no display needed, and a row is
comparable at a glance. Its vice is that reassigning it demands movement or a
jump.

The positive proof is the Octatrack's horizontal crossfader — contactless, "next
to no resistance so can be slammed around very quickly", the most-praised
control in the Elektron line, *because it does one thing forever*.

**Never multiplex a fader.** Faderfox sells the MX12 — twelve faders — purely to
bolt onto the PC12's 72 pots.

### 5.2 The root cause of every takeover problem

**MIDI 1.0 has no query mechanism.** A host cannot ask a controller where its
fader is. Only two-way protocols (MCU/HUI/EuCon), a controller-side cache, or
motors can know.

That single fact is why pickup/takeover modes exist and why they feel bad.
Ableton concedes Pick-Up makes it "difficult to estimate exactly where the
pick-up will take place". One performer describes the failure vividly: *"that
comb filter you are trying dampen the feedback on suddenly LOSES all of its
damping before you can think not to play the next note."*

This is implemented and tested in `packages/midi/src/learn.ts` — including the
detail that the *first* hardware sample must be ignored, because one reading
gives no direction and applying it reintroduces the jump.

### 5.3 Encoder feel

**You cannot buy detents and resolution in one part, so ship the modifier.**

Elektron's encoders are smooth, undetented and unlit, with coarse adjustment by
press-and-turn — which users rely on *and* resent. The MIDI Fighter Twister
reaches about 4× the resolution of a Faderfox UC4 but has no acceleration in
relative mode. Metropolix had to retrofit acceleration after owners complained
*"I hate rotating the encoder 100 times per step."*

**Fixed encoder curves are the most-complained-about detail in the entire
survey** — one turn covering a parameter's full range makes a four-value
parameter feel broken. Make curves range-aware and support relative MIDI.

### 5.4 Multiplexing one control across many tracks fails three ways

| Failure | Fixes seen in the wild |
|---|---|
| **Losing the page** | Elektron doubled page LEDs 4→8; the PC12 ships **98 sticky labels**; Metropolix's eight buttons carry **24 printed labels across three layers** |
| **Value jumps** | Endless encoders sidestep it entirely (why Novation's Mk3 replaced Mk2 pots). Snap needs two-way feedback — Faderfox found the Digitakt 2 "doesn't send any midi data after preset change" |
| **Misalignment** | The OXI One MkII's encoders "are not aligned with the four parameters on the display", so reviewers "repeatedly reach for the middle two". A 1:1 left-to-right mapping costs nothing |

The three best **layer-switching without jumps** designs:

- **Metropolix**: preset→panel loading opt-in *per data type*, plus a "Panel
  Values & Preset Overrides" screen showing where the physical switch disagrees.
- **Stochastic Inspiration Generator**: a separate retained value per function
  layer, updated only when a control is *nudged*.
- **meloDICER**: an explicit LOCK mode that stages edits and applies on exit.

### 5.5 Feedback and state visibility

**Rings are worth their cost only if their meaning is stable.** Wherever LED
meaning is multiplexed, users get the modality wrong: Metropolix's slider LEDs
mean stage position *and* gate state; meloDICER's 16-LED ring is time-shared
between step position, parameter number, memory slot and first/last step. Every
one drew documented confusion.

The Nord Lead 3's 26 LED-collared encoders made recall instant — Sound on Sound:
*"software synths would kill to have a hardware control surface like this"* —
and died on RoHS compliance, not merit.

**Every screenless device surveyed uses endless encoders. Screenless-plus-
absolute-pots does not exist**, and the reason is clear: without a screen or
rings, the performer has no idea where a value sits. The 16n Faderbank's lack of
LEDs makes it "really not very well suited to recording or playback of slider
movement".

**Enough screen = every control's assignment and value visible at once, no
scrolling.** A 128×64 mono OLED is sufficient if its only job is naming the
eight encoders. Auto-persisting live state ("always powers up exactly as you
left it") buys confidence without pixels.

### 5.6 Ergonomics

- **16 is the row length** because it is 4/4 at 16ths, maps two hands, and is
  the ceiling before targets drop below fingertip size (≈24px floor, 44px
  ideal). The 16-trig row is the most-praised control across every device
  surveyed.
- **Fader throw**: 100mm gives usable per-millimetre resolution; 60mm is the
  compromise; 30mm makes fine trims fiddly.
- **Spacing matters**: the Twister's ~20mm is praised; 0-CTRL's touchplates are
  "a little close together if you have fat fingers".
- **Encoder reliability is a design spec, not QA.** The Polyend jog wheel "has
  begun to jump values or simply not respond… I have babied this thing from day
  1" — and Polyend replied the overshoot "isn't a bug or issue with the device".

### 5.7 Multi-track

**8 is a cognitive ceiling, not a technical one.** *"8 tracks feels like it's
approaching my cognitive limit to manipulate on the fly."* Track count ≠ element
count — an MC-707 drum track holds 16 instruments.

The dominant complaints are about the **data model**, not the encoders.
MusicRadar on the Digitakt II: *"the combination of +Drive, Projects, Sample
Pools, Songs and Patterns feels like it adds too many layers of complexity."*

Two features matter more than track count: **polymeter** (per-track lengths that
survive a pattern change) and **song mode**.

### 5.8 Recommended layout for 8 tracks

- **8 faders, 60–100mm, absolute, not motorised**, one per track, permanently
  wired to track level. Never remapped, never paged, no pickup logic — which
  also means no dependence on two-way MIDI. LED meters beside them.
- **8 endless encoders with LED rings**, directly under the screen, aligned 1:1
  with eight on-screen parameter slots, **one fixed meaning each** — no modal
  ring displays. Because they are relative, the host never needs takeover.
- **16 backlit step buttons in a row**, doubling as the focused track's step
  editor. Per-step information belongs here, not in bars on the encoders.
- **8 track-select buttons** (LED for focus, second colour for mute) and **8 LED
  page buttons**, so an encoder's meaning never changes without a visible LED
  moving. Keep each parameter in the same slot on every page.
- **Buttons for all binary state.** Never put a state on an encoder.
- **One modest OLED (~128×64)** under a strict rule: it always shows exactly the
  eight things the eight encoders do, the focused track's name, and the page
  name. Do not buy a touchscreen; buy certainty.
- **Shift for fine/coarse, an undo, and press-to-show-value on every encoder.**
  No touch-sensitive mode switching — Polyend's own Play cons list includes
  "accidental encoder touches jump modes".

### 5.9 An open tension: 8 encoders or 24?

The two research passes disagree, and the disagreement is real:

- **The Novation research** argues the XL 3's **24 encoders** are its decisive
  advantage: three live parameters per track across eight tracks, simultaneously,
  with visible RGB ring state and zero paging.
- **The interface research** argues for **8 encoders with one fixed meaning
  each**, on the grounds that multiplexed LED meaning is the recurring failure
  mode — and that a 1:1 alignment between encoder and on-screen slot is free.

These are reconcilable — 24 physical encoders, all fixed-meaning, only eight of
them bound to "the current track's eight parameters" — but which reading wins is
a design decision, not a research finding. **This is the first thing to settle
before building the surface mapping.**

---

## 6. Part 4 — Platform and control surface

### 6.1 Buy versus build resolves toward buying

A Launch Control XL 3 costs less than a Pi 5 + Pisound + custom panel + a month
of firmware. Building only wins if the layout is genuinely bespoke — no
off-the-shelf surface gives you per-track fader *plus* per-step LED bar *plus*
encoder ring in one unit. If you go that way, the open-source **16n Faderbank**
(16× 60mm Alps faders, class-compliant, MIT firmware, ~$150–300 in parts) is a
better starting point than a blank PCB.

**Motorized faders are out**: the Alps RSA0N11M9A0K is ~€30 each, draws up to
800mA at 10V, has a 200-piece MOQ, and needs an H-bridge and a PID loop *per
channel*. Buy a Behringer X-Touch instead.

### 6.2 Novation Launch Control XL 3 — the recommendation

**$229.99.** 8× 60mm **touch-sensitive** faders; **24 endless encoders with RGB
rings**; 16 buttons; 128×64 mono OLED with a 1216-byte bitmap path; 5-pin DIN
In/Out/Out2-Thru; USB-C bus powered; class-compliant, boots into Standalone mode
by default; **48 addressable RGB LEDs**.

SysEx is documented and implemented in `packages/midi/src/novation/lcxl3.ts`.
Framer `F0 00 20 29 02 15 <cmd> … F7`. Commands: `01 53` RGB LED, `02` DAW mode,
`04` display config, `06` text, `09` full-screen bitmap. Feature CCs on channel
7: `30` surface mode, `69/72/73` per-row encoder relative mode, **`70` fader
pickup**, `71` touch, `121` encoder curve.

**Three traps worth knowing before you plug it in:**

1. **It exposes four USB MIDI interfaces** (Main, DAW, ToDIN1, ToDIN2).
   Custom-mode surface data arrives only on `Main`; DAW-mode only on `DAW`.
   Binding the wrong pair gives a surface that looks connected and does nothing.
2. **Easy Start makes it enumerate as a USB mass-storage device on first
   connect.** Disable by holding both Page buttons while connecting.
3. **Fader pickup is OFF by default** (Fader Pickup Type = Jump). You must
   enable it in Settings or send CC 70. And because the faders are not
   motorised, every page switch leaves a dead zone you sweep through.

**The real gap is no per-step LED grid** — you cannot show a 16/32-step pattern's
state. Only one bitmap is in memory at a time, so an animated step matrix is not
possible on the OLED either.

**The Custom Mode *push* format is undocumented.** Community reverse-engineering
found command `05` and it works, but it is unversioned and liable to break.
Author modes in Novation Components and treat programmatic writes as a stretch
goal — note that **Components has no Linux build**, so that needs one Mac/PC
session.

**Linux**: class-compliant, enumerates as `LCXL3`, runs on a Pi, no vendor
driver. The Windows driver only adds multi-port naming.

### 6.3 Akai — verdict: nothing beats the XL 3

| | Faders | Encoders | Value feedback | Grid | DIN out | Price |
|---|---|---|---|---|---|---|
| **LCXL 3** | 8× 60mm touch | **24 endless** | **24× RGB rings** | none | **5-pin I/O/Thru** | **$229.99** |
| MIDImix | 8× 30mm | 24 **absolute pots** | **none** | none | **no** | $85 |
| APC40 MKII | 9× 45mm | 16 endless | 15-LED **mono** rings | 40 RGB (128-palette) | **no** | $333 |
| APC mini mk2 | 9 absolute | **0** | pad RGB only | **64 RGB, true SysEx** | **no** | $85 |
| APC64 | 8 touch strips | **0** | **none — host-blind** | 64 RGB | 3.5mm TRS | $260 |
| MPC XL / Live III | 2 / 0 | 16 Q-Link / 0 | per-knob OLED (XL) | 16 RGB | 2 In / 4 Out | $2375 / $1599 |

**The decisive axis is encoder feedback, and Akai loses on it everywhere except
the APC40 MKII** — whose rings are monochrome and whose design dates to August
2014.

- **MIDImix is the structural twin and the wrong instrument.** The layout matches
  (8 faders, 24 knobs, 16 buttons) but Akai's own appendix says *"24 270°
  assignable knobs"*: **absolute potentiometers with zero LED feedback**. Every
  page change becomes a jump and the host cannot show where a value sits. Add
  30mm faders, USB-only, no DIN, no screen. It is a mixing surface, not a
  sequencing surface.
- **APC64 is the most interesting Akai and its role is inverted.** It has the
  only built-in sequencer that matches (8 tracks × 32 steps), plus 8 CV/Gate —
  but **no rotary encoders** and, critically, **no documented host LED
  protocol**. Your app cannot light a single one of its pads. It is a device you
  *receive* from, not one you drive.
- **APC mini mk2 has the best LED story in Akai's catalogue** — arbitrary 8-bit
  RGB per pad over documented SysEx — but **zero encoders**. It is a grid.
- **MPC XL / Live III** win outright on standalone sequencing, but the
  touchscreen *is* the UI and Controller Mode is a fixed mapping to MPC Desktop,
  not a generic programmable surface. An MPC is a peer, not a peripheral.

**Recommendation: keep the XL 3, and add an APC mini mk2 ($85) as the step
grid** — better than a Launchpad on price, and with true RGB SysEx rather than
the 128-colour velocity palette the APC40 MKII is stuck with. Implemented in
`packages/midi/src/akai/apcMiniMk2.ts`.

The honest case for an APC64 instead: only if you want a computer-free 8-track
sequencer driving external gear over TRS MIDI and CV/gate — a job the XL 3
cannot do at all. It is an addition, not a replacement.

**Linux**: Akai vendor id `0x09e8`; every controller here is USB-MIDI class
compliant with no quirk needed on a Pi. Note **no Akai controller except the
APC64 has any DIN output** — the entire controller line is USB-only.

### 6.4 Hardware tiers, if you build

| Tier | Recommendation |
|---|---|
| **Fastest to a working instrument** | Buy the XL 3. Run the app in a Chromium kiosk. Playable this week. |
| **Best custom build** | Raspberry Pi 5 (4GB) + Pisound/HiFiBerry for audio, plus an RP2350 or Teensy 4.1 control board over **USB MIDI class device** (not serial — serial forces Hairless MIDI). Encoders: Bourns PEC11R (pick detents and pulses independently). Faders: Alps RS60N1, **linear** taper. LEDs: **SK9822** (constant-current, no low-level flicker). |
| **Avoid** | Daisy Seed (production paused; Patch/Field discontinued). RP2040 for DSP (no FPU/SIMD). ESP32-S3 + Moddable XS as an audio engine (playback only). Pi Zero 2 W. Pi 5 8GB+ — the AI memory shortage pushed 16GB to ~$305. |

Two 2026 gotchas: **pin your kernel** — the `NO_RT_PUSH_IPI` regression in 7.1.5+
causes multi-second audio dropouts until you set `RT_PUSH_IPI` in
`sched/features`. And PipeWire's RTKit path caps at `SCHED_FIFO 20`; use rlimits
at priority 88 instead.

---

## 7. Part 5 — TypeScript stack

**Targeting Chrome** (decided 2026-09-14). That is a real simplification: Web
MIDI works including SysEx, AudioWorklet and PWA install are available, and a
Chromium kiosk on a Pi is a legitimate deployment target. Costs: a permission
prompt since Chrome 124, secure-context only, no MIDI 2.0/UMP, and **being a
MIDI clock *slave* is effectively unsupported** — the Audio WG has said it does
not see a way to do stable clock input with existing JS APIs. Master only.

| Layer | Choice | Notes |
|---|---|---|
| Build | **Vite 8.3** + pnpm workspaces | |
| UI | **React 19** | chosen deliberately over vanilla; see §9 |
| State | **Zustand 5** with `subscribeWithSelector` | Store lives outside React, so high-frequency parameter changes bypass rendering entirely |
| Audio | **Plain Web Audio** + AudioWorklet | No framework for timing |
| MIDI | **WebMidi.js 3.1.16** (Apache-2.0) | JZZ 1.9.6 as a fallback for UMP or polyfill |
| Tests | **Vitest** + `OfflineAudioContext`; Playwright for smoke | |

**Scheduling is the canonical lookahead pattern** — a coarse timer (100ms
window, 25ms interval) reading `audioContext.currentTime`, scheduling everything
inside the window. Measured jitter is ~8ms, which is 6–10% of a 16th note at
120–180 BPM: audible on dense hats, irrelevant on pads. Drift, not jitter, is
what kills you, and this eliminates it.

**Do not adopt an audio framework for timing.** Tone.js's npm `latest` tag is
**15.1.22 from April 2025** — the real active line (15.5.36) ships only under
`next`, and its `Transport` has open clock bugs (phantom replays on stop→start,
a buffer leak, ghost ticks). Use it at most as a synth/effect node library.

**Do not enable cross-origin isolation / SharedArrayBuffer.** It buys nothing
here and silently breaks things — a September 2026 postmortem describes COEP
killing nested rayon workers in a WASM build, invisible in local dev.

### Licensing traps

- **`@cutoff/audio-ui` is GPL-3.0-only** (dual-licensed commercial). It is the
  purpose-built audio knob/slider library and pulling it in would force GPL on
  your distribution. This is the biggest trap in the space.
- **JUCE is dual GPLv3/commercial** — a JUCE-compiled WASM engine makes the app
  GPL unless you buy a license.
- **`@grame/faustwasm` is LGPL-3.0.**
- **`@strudel/core` is AGPL-3.0-or-later**, and Strudel's own docs take an
  unusually aggressive view of scope — derivative work must be AGPL, source must
  be published with web publication, and even "clones informed by reading the
  source" count as derivative work. See §8 for why we copy the architecture
  rather than the code.

Everything actually used here is MIT or Apache-2.0.

### Browser gaps to design around

- **Web MIDI has no Safari support** — macOS or iOS, through 27/TP, no announced
  plan. Moot given Chrome-only, but it rules out iPad.
- **`react-rotary-knob`, `react-dial-knob`, `react-knob` are all dead**
  (2022–2023). Serious apps hand-roll a small SVG knob on pointer events with
  *relative* drag — which is also the fix for "jumps on grab". Done in
  `apps/web/src/ui/Knob.tsx`.
- **DOM beats canvas for the step grid**, for accessibility rather than
  performance: canvas elements cannot receive focus, so per-cell state cannot be
  announced.
- **44px touch targets**, or thumb-drumming misses ~25% of taps.

---

## 8. Part 6 — What's in this repo

```
packages/core     Pure generation and theory. No DOM, no audio. 73 tests.
  pattern/fraction.ts   Exact rational time (swing, polymeter, triplets)
  pattern/step.ts       The step model + 18 pure transforms
  theory/scale.ts       10 modes, two quantisers, degree mapping
  gen/                  rng, euclid, pitch-mixer, walk, turing, chaos
packages/audio    Scheduling + transport. 12 tests.
packages/midi     Web MIDI, encoder/pickup semantics, device SysEx. 14 tests.
apps/web          React 19 + Vite UI. 5 tests.
```

**104 tests, all passing. `make ci STRICT=1` is green.**

Three architectural decisions worth calling out:

1. **Rational time, not floats.** `1/3` added three times is exactly `1`, and
   `lcm(16, 12, 7) = 336` is exact. A triplet grid stays phase-locked to the bar
   forever. One subtlety this surfaced: `swingOffset(step, 2/3)` initially
   produced `667/2000` — a *different rhythm* that drifts — because it scaled the
   float. It now approximates by continued fractions with a bounded denominator.
2. **The pattern engine is bespoke, and that is a licensing decision as much as
   an engineering one.** Strudel's engine is headless, pure JS and battle-tested,
   but AGPL-3.0-or-later with an aggressive derivative-works reading. We copy the
   *architecture* — rational time, immutable wrapping transforms, a declared
   discrete-vs-continuous nature per operator — and take the theory layer from
   `@tonaljs/*` (MIT). The irreducible core is a few hundred lines.
3. **Generators take a seeded `Rng`, never `Math.random`.** Reproducibility is a
   requirement, not a nicety: the performer turns an encoder, hears something
   they like, and must be able to return to it. Every generator's state is a
   plain number you can store, display and recall.

Also fixed during the build, and worth keeping in mind: Bjorklund's raw output is
defined only up to rotation and emits a run of rests first — `E(4,16)` landed on
steps 3, 7, 11, 15, so **the downbeat was silent**. `euclid()` now rotates so
step 0 is always an onset. The gap multiset is rotation-invariant, so evenness
is untouched.

### Not built, deliberately

- **Voice allocation and synthesis.** The part with the least research and the
  most taste. Notes are in `packages/audio/src/index.ts` — including the 303
  slide/accent behaviour and the Modified-MVA allocator the slide rule requires.
- **The scheduler↔store glue.** Every piece exists and is tested; what is missing
  is an AudioContext and the `subscribeTransient` path into the scheduler.
- **Variable-order Markov.** Needs a phrase-capture UI. Constrain it from day one.

---

## 9. Open decisions

1. **8 encoders or 24?** See §5.9. This gates the surface mapping and should be
   settled first.
2. **React 19 versus vanilla TS.** React was chosen deliberately — best
   accessibility for free, largest contributor pool — and it *is* a departure
   from the zero-runtime-dependency pattern in `0d3sa/apps/hello-ts`. The
   mitigation is real and already in place: Zustand's store lives outside React
   and `subscribeTransient` drives `AudioParam`s at pointer rate with zero
   renders. But it is a genuine trade, and worth re-examining if the dependency
   weight becomes annoying.
3. ~~**Swing semantics.**~~ **Settled.** The knob is zero-based: 0 is straight
   and **2/3 is a triplet**, with the displacement being half the value, so 2/3
   yields the 1/3-of-a-step offset a triplet needs. Note this is deliberately
   *not* the convention the research table above uses, where 50% is straight and
   66.7% is a triplet — the zero-based form is what a UI knob wants, since a
   performer expects the leftmost position to mean "none". The mismatch is a
   genuine trap when reading the swing row of §4.2 against the code.
4. **Whether to add a Launchpad Mini instead of the APC mini mk2.** Both fill
   the step-grid gap; the APC mini mk2 is cheaper and has documented RGB SysEx,
   but Launchpad tooling (`launchpad.py`) is more mature — though it does not
   cover the XL 3 either, so either way you write the SysEx layer.
5. **Kiosk deployment.** A Chromium kiosk on a Pi needs a secure context for Web
   MIDI, which a LAN address is not. Either TLS or a localhost origin.

---

## 10. Principal sources

**Generation** — Toussaint, *The Euclidean Algorithm Generates Traditional
Musical Rhythms* (BRIDGES 2005); Brown & Gifford, *CMJ* 39(1) on
Ornstein–Uhlenbeck melodic expectation; Voss & Clarke (1978) on 1/f noise; MaxOrder
constraint (AAAI 2014); Pachet's Continuator; Ariza on Xenakis sieves; Vermona
meloDICER manual; Stochastic Inspiration Generator manual; Mutable Instruments
Marbles source; Intellijel Metropolix v1.6 manual; Music Thing Turing Machine.

**ML** — Huang et al., *Music Transformer*; Thickstun et al., *Anticipatory Music
Transformer*; MIDI-RWKV (arXiv 2506.13001); NotaGen; transformers.js v4;
onnxruntime 1.29 WebGPU notes; Stable Audio Open.

**Transform / live coding** — Strudel technical manual (Codeberg `uzu/strudel`;
GitHub archived June 2025); Tidal documentation; Elektron Digitakt II manual;
Elektronauts threads on trig conditions and polymeter; Renoise effect commands;
LSDj manual.

**Domain** — Mark Butler, *Unlocking the Groove* (2006) and *Playing with
Something That Runs* (2014); Rick Snoman, *Dance Music Manual* 5th ed. (2025);
Attack Magazine deconstructions (Strings of Life, Vordhosbn); Smith, *MTO*
27.2 (2021); Hill, ACMC 2005; Robin Whittle's TB-303 analyses; Anton Savov, "The
303 and MIDI"; Open303 / JC-303.

**Interface** — Sound on Sound and MusicRadar reviews; Elektronauts, Modwiggler
and lines threads; manuals for Digitakt II, Metropolix, 0-CTRL, meloDICER, SIG,
René, Pamela's New Workout, Hapax, T-1, Deluge, Push 3, MC-707, Electribe,
Play+, Tracker+; Faderfox, Electra One, MIDI Fighter Twister, 16n Faderbank,
X-Touch documentation; Ableton and Steinberg notes on takeover modes.

**Controllers** — Novation Launch Control XL 3 Programmer's Reference Guide;
Launchpad Pro MK3, Launchpad X and Launchkey MK4 PRGs; Akai APC40 MkII
Communications Protocol v1.2; APC mini mk2 Communication Protocol v1.0; APC64
User Guide; MIDImix User Guide; Linux `sound/usb/quirks-table.h` and `usb.ids`.

**TypeScript** — Chris Wilson, *A Tale of Two Clocks*; WAC 2025 MLS round-trip
latency study; caniuse Web MIDI; Chrome 124 permission-prompt announcement;
Baseline notes on AudioWorklet and SharedArrayBuffer; Tone.js issues #1417 and
#1419; Zustand docs on transient updates.
