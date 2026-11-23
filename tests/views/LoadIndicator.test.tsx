import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { LoadIndicator } from '@/views/LoadIndicator';
import { PlayNotice } from '@/views/PlayNotice';
import type { LoadStatus } from '@/audio/loadStatus';

/** A source of readings the test can speak through. */
function source() {
  const listeners = new Set<(status: LoadStatus) => void>();
  return {
    subscribe: (listener: (status: LoadStatus) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    say: (status: LoadStatus) => act(() => listeners.forEach((l) => l(status))),
    listeners,
  };
}

describe('the load indicator', () => {
  it('waits for its first reading', () => {
    render(<LoadIndicator source={source().subscribe} />);
    const meter = screen.getByRole('meter', { name: 'Simulation load' });
    expect(meter).toHaveTextContent('LOAD–');
    expect(meter).toHaveAttribute('aria-valuetext', 'Measuring');
  });

  it('shows the load as a percentage', () => {
    const readings = source();
    render(<LoadIndicator source={readings.subscribe} />);
    readings.say({ load: 0.174, level: 'ok', cause: null });
    const meter = screen.getByRole('meter');
    expect(meter).toHaveTextContent('LOAD17%');
    expect(meter).toHaveAttribute('aria-valuenow', '17');
    expect(meter).toHaveAttribute('data-level', 'ok');
  });

  it('says when there is little to spare', () => {
    const readings = source();
    render(<LoadIndicator source={readings.subscribe} />);
    readings.say({ load: 0.82, level: 'high', cause: null });
    expect(screen.getByRole('meter')).toHaveAttribute('data-level', 'high');
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toMatch(/82%.*little time to spare/);
  });

  it('says OVERLOAD when the sound is breaking up, with the true figure', () => {
    const readings = source();
    render(<LoadIndicator source={readings.subscribe} />);
    readings.say({ load: 1.58, level: 'over', cause: 'circuit' });
    const meter = screen.getByRole('meter');
    expect(meter).toHaveTextContent('OVERLOAD158%');
    expect(meter).toHaveAttribute('aria-valuenow', '100'); // the meter itself is full
    expect(meter.getAttribute('title')).toMatch(/breaking up/);
  });

  it('stops listening when it goes', () => {
    const readings = source();
    const { unmount } = render(<LoadIndicator source={readings.subscribe} />);
    expect(readings.listeners.size).toBe(1);
    unmount();
    expect(readings.listeners.size).toBe(0);
  });
});

describe('the play notice', () => {
  it('says nothing when there is nothing to say', () => {
    const { container } = render(<PlayNotice error={null} warnings={[]} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says why nothing may be heard', () => {
    render(<PlayNotice error={null} warnings={['Nothing is wired to the audio output.']} onDismiss={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('YOU MAY HEAR NOTHING');
    expect(screen.getByRole('status')).toHaveTextContent('Nothing is wired to the audio output.');
  });

  it('says the sound is breaking up, and what to do about a circuit that is too big', () => {
    render(<PlayNotice error={null} warnings={[]} overload="circuit" onDismiss={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('THE SOUND IS BREAKING UP');
    expect(screen.getByRole('status')).toHaveTextContent(/Take some parts out/);
  });

  it('does not blame a light circuit for a busy computer', () => {
    render(<PlayNotice error={null} warnings={[]} overload="computer" onDismiss={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(/computer is too busy/);
    expect(screen.getByRole('status')).not.toHaveTextContent(/parts out/);
  });

  it('can say both at once', () => {
    render(<PlayNotice error={null} warnings={['No power.']} overload="circuit" onDismiss={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('THE SOUND IS BREAKING UP');
    expect(screen.getByRole('status')).toHaveTextContent('YOU MAY HEAR NOTHING');
  });

  it('puts a failure to start before everything else', () => {
    render(<PlayNotice error="The audio engine could not start." warnings={['No power.']} overload="circuit" onDismiss={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('NO SOUND');
    expect(screen.getByRole('alert')).not.toHaveTextContent('BREAKING UP');
  });

  it('can be dismissed', () => {
    const onDismiss = vi.fn();
    render(<PlayNotice error={null} warnings={[]} overload="circuit" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
