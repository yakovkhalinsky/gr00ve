# Using gr00ve

A generative multi-track sequencer. You set up *rules* — a rhythm, a pool of
pitches, a register — and it plays something; you steer it while it runs.

Live at **<https://yakov.khalinsky.com/gr00ve/>**. Use that **https** address:
the `github.io` one redirects over plain `http`, and Web MIDI needs a secure
context, so arriving that way would silently disable MIDI.

Targets **Chrome** (or another Chromium browser). There is no Safari or iOS
support, and there never will be — no browser on those platforms implements
Web MIDI.

---

## Getting started

1. Open the page.
2. Press **Play**.

That is genuinely all. The app starts with two melodic tracks and six drum
tracks already written, so the first click produces music rather than silence.

If you hear nothing, the usual cause is that the browser refused to start audio.
Press Play again — the context is created inside that click, so a second press
usually resolves it. Also check the tab isn't muted and the system volume is up.

---

## A five-minute tour

**1. Listen for a minute.** The eight tracks are on loop lengths of 16, 7, 16,
16, 16, 16, 5 and 7 steps. Because those don't divide into each other, the
tracks drift against one another and the pattern doesn't repeat for a long time
— roughly **35 bars** before everything realigns. Watch the white playhead
outlines: they start together and gradually slide apart. That's the point.

**2. Change the drum kit.** On Track 4 (the snare), use the dropdown under the
mode button to switch it to **Tom**. Try the others. Each is synthesised live,
so they respond instantly.

**3. Turn a rhythm track into a melody.** On Track 5 (the hats), click the mode
button — it reads **Rhythm**. It becomes **Voice**: the track now plays pitched
notes instead of a drum, using the drum part's rhythm. Click it again to switch
back. Nothing is lost either way.

**4. Rewrite a track's pitches.** Move some faders in the **Pitch probability**
panel — one per note in the scale. Pull one to zero to remove that note from
the pool entirely. Now click **E(4,16)** on Track 1 (the bass). Its notes are
redrawn from your new weights. Change the **Scale** in that panel's header and
watch the faders change with it — a pentatonic leaves five, a mode seven.

**5. Change the rhythm.** At the bottom of the page, set **Pulses** to `5` and
**Steps** to `8`. Click **E(5,8)** on Track 6. You've just written a Euclidean
pattern — five evenly-spread hits in eight steps.

**6. Make it swing.** Drag the **Swing** knob in the transport bar up to about
`67%`. The off-beats push late into a triplet feel. Note the loop lengths don't
change — swing redistributes time *within* the bar, it doesn't stretch it, so
the pattern still realigns at exactly the same moment.

**7. Clear something.** Click **Clear** on Track 3. It empties. There's no undo,
so get it back with **E(4,16)**.

---

## Reference

### Transport bar

| Control | Range | What it does |
|---|---|---|
| **Play / Stop** | — | Starts and stops. Always starts from the top of the pattern. |
| **Tempo** | 20–300 BPM | Speed. Takes effect from the next step — it won't lurch mid-note. |
| **Swing** | 0–90% | Delays every *odd* step. **0 is straight and ~67% is a triplet feel** — the knob is zero-based, so it does not follow the convention where 50% is straight. |
| **Scale** | 10 modes | Which notes pitch generation snaps to. Aeolian, Dorian and Phrygian cover almost all electronic music. |
| Root note | — | Display only (A2 by default). The scale is built upward from here. |

### Pitch probability

**One fader per note in the scale.** Each sets how likely that note is to be
chosen when a pattern is generated. Pull one to zero and the note is removed
from the pool entirely — there's no separate on/off. The **scale selector sits
in this panel's header**, because the scale is what decides which notes exist.

**Changing the scale changes how many faders there are** — five for a
pentatonic, seven for a mode. That is the honest consequence of the scale
defining the palette, not a quirk. The panel used to show a fixed twelve
chromatic faders, which looked like twelve notes but only ever produced the
scale's: with a minor pentatonic, the faders labelled A♯, C♯, F♯ and G♯ all
collapsed onto their neighbours and summed their weights invisibly, so four of
them did nothing you could see. Now every fader does something and its label is
the note it actually plays.

This panel decides *what* the generators play. **E(k,n)** decides *when*.
Changing a fader does nothing until you generate, so nothing you've edited by
hand gets overwritten underneath you.

Two behaviours worth knowing:

- **Accidentals are shown only when the scale has them.** In Aeolian you get
  B, C, E and F with no sharps; in Phrygian the second degree is a semitone, so
  the fader is labelled A♯. The labels always name a real note you can get.
- **The octave jump is rare by default.** The third octave is deliberately
  unused, because a wide range makes an electronic lead muddy rather than
  expressive.

### A track strip

Each of the eight rows is a track. Left to right:

| Control | What it does |
|---|---|
| **Track name** | Highlights the row. Currently cosmetic. |
| **Mute** | Silences the track. Turns orange when engaged. |
| **Loop** | The track's loop length in steps, from 1 up to the pattern's own length. This is the polymeter control. |
| **Mode (Voice / Rhythm)** | Switches the track between pitched notes and one drum sound. Filled blue in Rhythm mode. |
| **Drum** | Which drum. Greyed out on a Voice track — but it still shows what the track *would* play if you switched it. |
| **E(k,n)** | Writes a Euclidean pattern into this track, using the Pulses and Steps from the generator panel at the bottom of the page. |
| **Clear** | Empties the track's steps. **No undo.** |
| Step grid | See below. |

**Loop length and pattern length are separate.** Lowering a track's Loop to 5
doesn't delete any steps — it just reads the first five of them and repeats, and
raising it brings the rest back.

Cells beyond the loop are **dimmed**, because the playhead wraps at the loop
length and never reaches them. They stay clickable, so a pattern can be edited
before the loop is lengthened, but they will not sound as they stand.

The knob stops at the pattern's length rather than going higher. A longer loop
would read past the end of the grid, where there is nothing to play, so the tail
of the loop would fall silent — which is not what "make the loop longer" ought
to mean.

### The step grid

Steps wrap into **rows of 8**, so each row is half a bar. Numbers are absolute:
step 9 is step 9, not "row 2, step 1".

- **Click any step** to toggle it on or off.
- **Blue** is a note. **Orange** is an accented note — louder, and on a pitched
  voice brighter too.
- **White outline** is the playhead, and every track has its own, running at its
  own loop length. That's why they drift apart.
- The first cell of each row has a brighter left edge marking the half-bar, and
  every fourth step is subtly marked as a downbeat.
- **Melodic steps are labelled with their note** — `C4`, `A#3`. The octave is
  part of the label because the mixer's occasional octave jump means two steps
  with the same note name can sit an octave apart, which is invisible without
  it. **Rhythm tracks show no labels**: a drum ignores the pitch stored in its
  cells, so labelling a kick step `C3` would claim something untrue. The drum's
  name in the picker above is what identifies it.

Hand-placed steps are **unaccented**. Only generated patterns accent their
downbeats — so if you want accents, generate, then edit around them.

### The generator panel

At the **bottom of the page**. Two knobs:

- **Pulses (k)** — how many hits.
- **Steps (n)** — how many steps to spread them across.

Then click **E(k,n)** on whichever track you want to write to. The pair are
parameters for that button, which is why they're easy to miss up there — see
*Limitations* below.

Euclidean rhythm is the one generator here whose two controls are readable with
no training: you turn `k` and `n` and hear exactly what they mean. Four-on-the-
floor is E(4,16); three-against-eight is the tresillo.

**Every press gives a new phrase.** Each track keeps a generation seed that
advances whenever you generate, so pressing E repeatedly varies the pattern
rather than returning the same one. The seed is stored, which means a phrase is
reproducible rather than lost — though there is no control to dial a particular
seed back yet.

### MIDI out

Press **Enable MIDI out**, allow the browser's permission prompt, and pick a
port. The sequencer then plays whatever is on the other end.

Built for a **MIDI-to-CV module** in a Eurorack rig, which is why the defaults
are what they are:

- **One channel per track.** Track 1 sends on channel 1, through track 8 on
  channel 8. A module like an Expert Sleepers FH-2 or a Mutable Yarns maps each
  channel to its own pitch CV and gate pair, so eight tracks are eight voices
  rather than a queue on one wire. Configure your module to match; the mapping
  is fixed for now.
- **Gate length follows the step.** Gate length comes from the gap between
  note-on and note-off, so both are always sent — and a slide, whose gate would
  otherwise run right up to the next note, is shortened by a sliver so the
  following note still retriggers. Without that the gate would never close and
  the note after a slide would not sound.
- **Accents go out at full velocity** (127); ordinary notes sit in a band well
  below (~100). Route velocity to a second CV if your module has one spare.
- **Drum tracks send General MIDI notes** — kick 36, snare 38, hat 42 — so a
  rhythm track also drives a drum module or a DAW, not just a gate.
- **Clock (24 ppqn)** is a checkbox. Turn it on to run anything with its own
  sequencer: a clocked LFO, a second sequencer, a euclidean module. Transport
  start and stop are sent too, on Play and Stop. It can be toggled while
  playing.

Two things to know:

- **The permission prompt needs a click.** Browsers refuse to raise it
  unprompted, which is why nothing is requested until you press the button.
- **Timing is timestamped.** Notes and clocks are sent with a future timestamp
  rather than fired immediately, so they land on the audio clock instead of the
  moment a JavaScript timer happened to run. If something in the rack sounds a
  few milliseconds loose, check the module's own clock source isn't also
  running — two clocks is two tempos.

---

## Controls

### Knobs

Knobs are **relative** — grab one and it moves from wherever it already is,
rather than jumping to your cursor. That's deliberate; jump-on-grab is the most
common complaint about on-screen knobs.

| Action | Effect |
|---|---|
| Drag up/down | Change the value |
| **Shift** + drag | Fine adjust (10× finer) |
| **↑ ↓ ← →** | Coarse steps |
| **Shift** + arrows | Fine steps |
| **Home / End** | Minimum / maximum |
| Mouse wheel | One step |
| **Double-click** | Type an exact value; **Enter** commits, **Esc** cancels |

Every knob is a real focusable control with its value exposed to assistive
technology, so **Tab** reaches them and a screen reader announces position and
value.

### Everything else

Step buttons and mode buttons are ordinary buttons — **Tab** to reach them,
**Space** or **Enter** to activate. Each step's accessible name carries its
position and state ("Track 1, step 5, on"), so the grid is navigable without
seeing it.

---

## Limitations

Things that are missing rather than hidden:

- **No undo.** Clear is immediate and unrecoverable. Regenerating with E(k,n) is
  the way back, which works for generated patterns but not hand-edited ones.
- **No saving.** A page reload loses everything. There's no export yet either.
- **The generator panel is below the tracks**, so the `k` and `n` that E(k,n)
  uses are off-screen when you press it. A layout wart.
- **No MIDI input.** Nothing responds to a hardware controller yet. The mapping
  semantics and the Launch Control XL 3 / APC mini mk2 SysEx are written and
  tested, but not connected — so a controller plugged in does nothing.
- **MIDI channels aren't configurable.** The track-to-channel mapping is fixed
  at 1:1. If your module is set up differently, change it there.
- **No MIDI clock input.** The sequencer can be a clock master but not a slave,
  which is a browser limitation rather than a choice: there is no way to do
  stable MIDI clock input with the APIs available.
- **Track register, drum tuning and pattern rotation aren't exposed.** The
  engine honours all three — they're seeded per track and audible — but there's
  no control for them.
- **Track selection is cosmetic.** Clicking a track name highlights it and does
  nothing else.
- **There's only one generator per track**, and it's always Euclidean. The
  mean-reverting walk, the Turing-machine shift register and the logistic map
  are all built and tested but not reachable from the interface.
- **Eight tracks, one pattern.** No song mode or pattern chaining.

---

## Where the design came from

Most of the non-obvious choices — why faders are never remapped, why the mode
column is a fixed width, why the bass is darker than the lead, why the third
octave is unused — are argued in **[research-brief.md](research-brief.md)**,
which documents the research behind the whole project along with what couldn't
be verified.
