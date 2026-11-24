import { describe, it, expect, afterEach } from 'vitest';
import { isPlayShortcut, isTextField, shortcutName, undoShortcut } from '@/utils/keyboard';

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

/** The key event a press of `key` on `target` makes. */
function press(key: string, target: EventTarget, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('Ctrl+Z and Cmd+Z for undo and redo', () => {
  it('is undo with Ctrl or Cmd, wherever the focus is', () => {
    expect(undoShortcut(press('z', document.body, { ctrlKey: true }))).toBe('undo');
    expect(undoShortcut(press('z', document.body, { metaKey: true }))).toBe('undo');
    expect(undoShortcut(press('z', page('<button>Rotate</button>'), { metaKey: true }))).toBe('undo');
    expect(undoShortcut(press('z', page('<div class="react-flow__node" tabindex="0"></div>'), { ctrlKey: true }))).toBe('undo');
  });

  it('is redo with Shift as well, or Ctrl+Y', () => {
    expect(undoShortcut(press('Z', document.body, { metaKey: true, shiftKey: true }))).toBe('redo');
    expect(undoShortcut(press('Z', document.body, { ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(undoShortcut(press('z', document.body, { ctrlKey: true, shiftKey: true }))).toBe('redo'); // caps lock
    expect(undoShortcut(press('y', document.body, { ctrlKey: true }))).toBe('redo');
  });

  it('is not Z by itself, or with Alt, or any other key', () => {
    expect(undoShortcut(press('z', document.body))).toBeNull();
    expect(undoShortcut(press('z', document.body, { ctrlKey: true, altKey: true }))).toBeNull();
    expect(undoShortcut(press('x', document.body, { ctrlKey: true }))).toBeNull();
    expect(undoShortcut(press('y', document.body, { metaKey: true }))).toBeNull(); // the browser's own on a Mac
  });

  it.each(['<input>', '<input type="search">', '<textarea></textarea>', '<div contenteditable="true"></div>'])(
    'leaves %s to undo its own typing', (html) => {
      expect(undoShortcut(press('z', page(html), { metaKey: true }))).toBeNull();
      expect(undoShortcut(press('Z', page(html), { metaKey: true, shiftKey: true }))).toBeNull();
    });

  it('is undo in a list, a slider, and a text box holding what the circuit already has', () => {
    expect(undoShortcut(press('z', page('<select><option>Sine</option></select>'), { ctrlKey: true }))).toBe('undo');
    expect(undoShortcut(press('z', page('<input type="range">'), { ctrlKey: true }))).toBe('undo');
    expect(undoShortcut(press('z', page('<input data-settled="true">'), { ctrlKey: true }))).toBe('undo');
    expect(undoShortcut(press('z', page('<input data-settled="false">'), { ctrlKey: true }))).toBeNull();
  });

  it('waits while a dialog is asking something', () => {
    page('<div role="alertdialog" aria-modal="true"><button>Discard</button></div>');
    expect(undoShortcut(press('z', document.body, { ctrlKey: true }))).toBeNull();
  });
});

describe('how a shortcut is written', () => {
  const platform = (value: string) => Object.defineProperty(navigator, 'platform', { value, configurable: true });
  const before = navigator.platform;
  afterEach(() => { platform(before); });

  it('uses the Mac\'s signs on a Mac', () => {
    platform('MacIntel');
    expect(shortcutName('Z')).toBe('⌘Z');
    expect(shortcutName('Z', { shift: true })).toBe('⇧⌘Z');
  });

  it('spells it out elsewhere', () => {
    platform('Win32');
    expect(shortcutName('Z')).toBe('Ctrl+Z');
    expect(shortcutName('Z', { shift: true })).toBe('Ctrl+Shift+Z');
  });
});
