/**
 * Rendered figures for the guide.
 *
 * The guide is mostly prose and tables, which explains the controls but never
 * shows them. Someone opening the sequencer for the first time has to match a
 * sentence like "blue is a note, orange is an accented note" against pixels
 * they have not seen yet — so these are the actual appearances, at the actual
 * sizes and colours, captioned with what each one does.
 *
 * Built as plain DOM rather than by importing the real components: the guide is
 * a static page and the components need the sequencer's store, an audio
 * context and React. The trade is that the styles below mirror `styles.css`
 * rather than sharing it, so a change to the app's palette has to be mirrored
 * here. That is why every colour is a token rather than a literal.
 */

/** A step, in each of the states the grid can show. */
const STEP_STATES: readonly { cls: string; label: string; note?: string }[] = [
  { cls: '', label: 'off' },
  { cls: 'is-on', label: 'on', note: 'C3' },
  { cls: 'is-accent', label: 'accent', note: 'E3' },
  { cls: 'is-playing', label: 'playing', note: 'G3' },
  { cls: 'is-outside', label: 'outside loop', note: 'D3' },
];

const KNOB_SVG = `
<svg viewBox="0 0 48 48" width="58" height="58" aria-hidden="true">
  <circle class="fig-knob__track" cx="24" cy="24" r="19"></circle>
  <circle class="fig-knob__arc" cx="24" cy="24" r="19"
          stroke-dasharray="45 200" transform="rotate(135 24 24)"></circle>
  <g transform="rotate(6 24 24)"><line class="fig-knob__pointer" x1="24" y1="9" x2="24" y2="18"></line></g>
</svg>`;

const FADERS: readonly { note: string; value: number }[] = [
  { note: 'A2', value: 100 },
  { note: 'C3', value: 78 },
  { note: 'D3', value: 30 },
  { note: 'E3', value: 64 },
  { note: 'G3', value: 14 },
];

/** Eight steps, the last three dimmed as outside a five-step loop. */
const LOOP_ROW: readonly string[] = [
  'is-on', 'is-on', 'is-on', 'is-on', 'is-on', 'is-on is-outside', 'is-on is-outside', 'is-on is-outside',
];

function figure(title: string, body: string, stage: string): string {
  return `
    <figure class="fig">
      <div class="fig__stage">${stage}</div>
      <figcaption class="fig__caption">
        <h3>${title}</h3>
        <p>${body}</p>
      </figcaption>
    </figure>`;
}

/**
 * The figure section's markup.
 *
 * Split out from `buildFigures` so it can be asserted without a DOM: a typo in
 * a template literal here produces a silently mangled section rather than an
 * error, and the tests check the tags balance and every figure survives.
 */
export function figuresMarkup(): string {
  return `
    <h2>Controls at a glance</h2>
    <p class="figs__lede">
      The elements you will meet in the sequencer, at the sizes and colours they
      actually appear in, so the reference below has something to refer to.
    </p>
    <div class="figs__grid">

      ${figure('Knob', `
        Drag <strong>up and down</strong> to change the value. It moves relative
        to where it already is, so it never jumps to your cursor. Hold
        <kbd>Shift</kbd> while dragging for fine adjustment, use the
        <strong>arrow keys</strong> to nudge, <kbd>Home</kbd> and <kbd>End</kbd>
        to jump to the limits, and <strong>double-click</strong> to type an exact
        number.`, `
        <div class="fig-knob">
          ${KNOB_SVG}
          <div class="fig-knob__labels">
            <span class="fig-knob__label">Tempo</span>
            <span class="fig-knob__value">128 BPM</span>
          </div>
        </div>`)}

      ${figure('Pitch faders', `
        One fader per note in the scale. Pull one to <strong>zero</strong> and
        that note leaves the pool entirely — there is no separate on/off. They
        decide <em>what</em> the generators play; <strong>E(k,n)</strong> decides
        <em>when</em>.`, `
        <div class="fig-faders">
          ${FADERS.map((f) => `
            <span class="fig-fader">
              <span class="fig-fader__track"><span class="fig-fader__fill" style="height:${f.value}%"></span></span>
              <span class="fig-fader__note">${f.note}</span>
            </span>`).join('')}
        </div>`)}

      ${figure('Step states', `
        A step is one of these five things. <strong>Blue</strong> is a note,
        <strong>orange</strong> an accented one, the <strong>outline</strong> is
        the playhead. <strong>Dimmed</strong> means outside the track's loop, so
        it never sounds. Melodic tracks label each step with its note.`, `
        <div class="fig-steps">
          ${STEP_STATES.map((s) => `
            <span class="fig-step">
              <span class="fig-step__cell step ${s.cls}">${s.note ? `<span class="step__note">${s.note}</span>` : ''}</span>
              <span class="fig-step__label">${s.label}</span>
            </span>`).join('')}
        </div>`)}

      ${figure('Loop length', `
        The <strong>Loop</strong> knob says how many steps a track cycles
        through. Shortening it makes the track repeat sooner — this is what
        makes tracks drift against each other. Steps past the loop are dimmed
        because the playhead turns around before reaching them.`, `
        <div class="fig-loop">
          <div class="fig-steps">
            ${LOOP_ROW.map((cls, i) => `
              <span class="fig-step">
                <span class="fig-step__cell step ${cls}"><span class="step__note">${['C3', 'E3', 'G3', 'A3', 'C4', 'E4', 'G4', 'A4'][i]}</span></span>
              </span>`).join('')}
          </div>
          <p class="fig-loop__caption">Loop = 5 — the last three never play</p>
        </div>`)}

      ${figure('Voice or rhythm', `
        Every track is either a pitched <strong>voice</strong> drawing notes from
        the scale, or a <strong>rhythm</strong> playing one drum. Switching
        keeps the steps: a rhythm track still holds its pitches, so switching
        back restores the melody, and the drum picker stays live underneath.`, `
        <div class="fig-modes">
          <button type="button" class="track__kind" data-kind="voice" tabindex="-1">Voice</button>
          <button type="button" class="track__kind" data-kind="rhythm" tabindex="-1">Rhythm</button>
        </div>
        <p class="fig-loop__caption">Filled means rhythm</p>`)}

    </div>
  `;
}

/**
 * The figure section as a DOM node, ready to insert into the rendered guide.
 *
 * Inserted before the Reference section rather than appended, because that is
 * where a reader wants it: after the tour has said what the thing is, and
 * before the reference starts describing controls by name.
 */
export function buildFigures(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'figs';
  section.innerHTML = figuresMarkup();
  return section;
}
