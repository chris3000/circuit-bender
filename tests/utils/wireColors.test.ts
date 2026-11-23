import { describe, it, expect } from 'vitest';
import { resolveWireColors, wireNets, WIRE_COLORS } from '@/utils/wireColors';
import type { Connection } from '@/types/circuit';

const wire = (id: string, from: string, to: string, color?: string): Connection => {
  const end = (s: string) => { const [componentId, pinId] = s.split('.'); return { componentId, pinId } as Connection['from']; };
  return { id: id as Connection['id'], net: `net-${id}` as Connection['net'], from: end(from), to: end(to), ...(color ? { color } : {}) };
};

describe('wireNets', () => {
  it('puts wires that share a pin, directly or through others, in one net', () => {
    const nets = wireNets([
      wire('a', 'r1.2', 'j.0'), wire('b', 'j.0', 'c1.1'), wire('c', 'c1.1', 'ic.3'),
      wire('d', 'r1.1', 'pot.0'), // the other end of r1 is not joined to it through the part
      wire('e', 'x.0', 'y.0'),
    ]);
    expect(nets.get('a' as never)).toBe(nets.get('b' as never));
    expect(nets.get('b' as never)).toBe(nets.get('c' as never));
    expect(nets.get('d' as never)).not.toBe(nets.get('a' as never));
    expect(new Set(nets.values()).size).toBe(3);
  });

  it('joins two nets when a later wire bridges them', () => {
    const nets = wireNets([wire('a', 'p.0', 'q.0'), wire('b', 'r.0', 's.0'), wire('c', 'q.0', 'r.0')]);
    expect(new Set(nets.values()).size).toBe(1);
  });
});

describe('resolveWireColors', () => {
  it('draws a whole net in the color any of its wires was given', () => {
    const colors = resolveWireColors([wire('a', 'r1.2', 'j.0'), wire('b', 'j.0', 'c1.1', 'green'), wire('c', 'x.0', 'y.0')]);
    expect(colors.get('a' as never)?.id).toBe('green');
    expect(colors.get('b' as never)?.id).toBe('green');
    expect(colors.has('c' as never)).toBe(false);
  });

  it('lets the earlier wire win where two colored nets have been joined', () => {
    const colors = resolveWireColors([wire('a', 'p.0', 'q.0', 'red'), wire('b', 'r.0', 's.0', 'blue'), wire('c', 'q.0', 'r.0')]);
    expect([...colors.values()].map((c) => c.id)).toEqual(['red', 'red', 'red']);
  });

  it('ignores a color it does not know (a file from elsewhere)', () => {
    expect(resolveWireColors([wire('a', 'p.0', 'q.0', 'chartreuse')]).size).toBe(0);
  });

  it('gives every color a shade for each view, different from the selection pink', () => {
    for (const color of WIRE_COLORS) {
      expect(color.schematic).toMatch(/^#[0-9A-F]{6}$/);
      expect(color.board).toMatch(/^#[0-9A-F]{6}$/);
      expect([color.schematic, color.board]).not.toContain('#FF2D55');
    }
    expect(new Set(WIRE_COLORS.map((c) => c.id)).size).toBe(WIRE_COLORS.length);
  });
});
