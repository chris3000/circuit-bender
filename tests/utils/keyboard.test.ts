import { describe, it, expect, afterEach } from 'vitest';
import { isPlayShortcut, isTextField } from '@/utils/keyboard';

/** Put some HTML on the page and return its first element. */
function page(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

/** The key event a press of Space on `target` makes. */
function space(target: HTMLElement, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('typing', () => {
  it.each([
    '<input>', '<input type="text">', '<input type="number">', '<input type="search">', '<textarea></textarea>',
    '<select><option>a</option></select>', '<div contenteditable="true"></div>',
  ])('%s is typed into', (html) => {
    expect(isTextField(page(html))).toBe(true);
  });

  it('counts text inside something editable', () => {
    const inner = page('<div contenteditable="true"><b>bold</b></div>').querySelector('b')!;
    expect(isTextField(inner)).toBe(true);
  });

  it.each([
    '<input type="range">', '<input type="checkbox">', '<button>Go</button>', '<div tabindex="0"></div>', '<a href="#">link</a>',
  ])('%s is not', (html) => {
    expect(isTextField(page(html))).toBe(false);
  });

  it('is not happening when nothing in particular has the key', () => {
    expect(isTextField(null)).toBe(false);
    expect(isTextField(document)).toBe(false);
  });
});

describe('Space for play and stop', () => {
  it('is Space on the page', () => {
    expect(isPlayShortcut(space(document.body))).toBe(true);
    expect(isPlayShortcut(space(page('<div tabindex="0"></div>')))).toBe(true);
  });

  it('is not any other key', () => {
    expect(isPlayShortcut(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false);
  });

  it.each(['<input>', '<textarea></textarea>', '<select></select>', '<div contenteditable="true"></div>'])('is not Space typed into %s', (html) => {
    expect(isPlayShortcut(space(page(html)))).toBe(false);
  });

  it.each([
    '<input type="range">', '<button>Board</button>', '<button role="switch">SOUND</button>', '<div role="slider" tabindex="0"></div>',
    '<div role="button" tabindex="0" class="react-flow__node"></div>',
  ])('is Space on %s, which may just have kept the focus after a click', (html) => {
    expect(isPlayShortcut(space(page(html)))).toBe(true);
  });

  it('is not a key held down, or pressed with Ctrl, Alt or Cmd', () => {
    expect(isPlayShortcut(space(document.body, { repeat: true }))).toBe(false);
    expect(isPlayShortcut(space(document.body, { ctrlKey: true }))).toBe(false);
    expect(isPlayShortcut(space(document.body, { metaKey: true }))).toBe(false);
    expect(isPlayShortcut(space(document.body, { altKey: true }))).toBe(false);
  });

  it('waits while a dialog is asking something', () => {
    const button = page('<div role="alertdialog" aria-modal="true"><button>Discard</button></div>').querySelector('button')!;
    expect(isPlayShortcut(space(button))).toBe(false);
    expect(isPlayShortcut(space(document.body))).toBe(false); // wherever the focus has got to
  });
});
