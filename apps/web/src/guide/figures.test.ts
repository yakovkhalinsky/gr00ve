import { test } from 'node:test';
import assert from 'node:assert/strict';

import { figuresMarkup } from './figures.ts';

/**
 * The figure markup is a large template literal, so the realistic failure is a
 * typo that produces a silently mangled section rather than an error — an
 * unclosed `div` swallows the rest of the page and nothing complains. These
 * check it parses as intended without needing a DOM.
 */

const html = figuresMarkup();

/** Count opens and closes for a tag. */
function tags(tag: string): { open: number; close: number } {
  return {
    open: (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length,
    close: (html.match(new RegExp(`</${tag}>`, 'g')) ?? []).length,
  };
}

test('every tag is balanced', () => {
  // div and figure are the ones that nest; a mismatch reflows the whole page.
  for (const tag of ['div', 'figure', 'figcaption', 'section', 'span', 'p', 'svg', 'g', 'button']) {
    const { open, close } = tags(tag);
    assert.equal(open, close, `<${tag}> opens ${open} but closes ${close}`);
  }
});

test('the section has a heading for the table of contents to pick up', () => {
  // main.ts inserts this before building the TOC, so an h2 here becomes an
  // entry in it.
  assert.ok(html.includes('<h2>Controls at a glance</h2>'), 'missing the h2');
});

test('every documented control has a figure', () => {
  for (const title of [
    'Knob',
    'Pitch faders',
    'Step states',
    'Loop length',
    'Voice or rhythm',
  ]) {
    assert.ok(html.includes(`<h3>${title}</h3>`), `no figure for "${title}"`);
  }
});

test('there are as many figures as figure captions', () => {
  const figures = tags('figure');
  assert.equal(figures.open, 5, 'expected five figures');
  const captions = tags('figcaption');
  assert.equal(captions.open, figures.open, 'a figure is missing its caption');
});

test('the step figure shows every state the grid can render', () => {
  // These class names are the contract with styles.css — if the app renames a
  // state and this lags behind, the guide quietly illustrates the wrong thing.
  for (const cls of ['is-on', 'is-accent', 'is-playing', 'is-outside']) {
    assert.ok(html.includes(cls), `step figure is missing the "${cls}" state`);
  }
});

test('the loop figure dims exactly the steps past the loop', () => {
  // The caption says the loop is 5; the row must show three dimmed cells, or
  // the illustration contradicts its own caption.
  const dimmed = (html.match(/is-outside/g) ?? []).length;
  // One in the step-states figure, three in the loop row.
  assert.equal(dimmed, 4, `expected 4 dimmed cells, found ${dimmed}`);
  assert.ok(html.includes('Loop = 5'), 'the loop figure lost its caption');
});

test('the knob figure carries the same parts as the real knob', () => {
  for (const part of ['fig-knob__track', 'fig-knob__arc', 'fig-knob__pointer']) {
    assert.ok(html.includes(part), `knob figure is missing ${part}`);
  }
});

test('the illustration buttons are not focusable', () => {
  // They are pictures of buttons, not buttons. A tab stop that does nothing
  // when pressed is worse than no tab stop.
  const buttons = html.match(/<button[^>]*>/g) ?? [];
  assert.ok(buttons.length > 0, 'expected the mode buttons');
  for (const tag of buttons) {
    assert.ok(tag.includes('tabindex="-1"'), `focusable illustration: ${tag}`);
  }
});
