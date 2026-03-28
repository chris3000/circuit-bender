import { describe, it, expect } from 'vitest';
import { NetAnalyzer } from '@/simulation/NetAnalyzer';
import type { Connection, ComponentId, PinId, ConnectionId, NetId } from '@/types/circuit';

const makeConnection = (
  fromComp: string,
  fromPin: string,
  toComp: string,
  toPin: string,
  id: string = `conn_${fromComp}_${toComp}`
): Connection => ({
  id: id as ConnectionId,
  from: { componentId: fromComp as ComponentId, pinId: fromPin as PinId },
  to: { componentId: toComp as ComponentId, pinId: toPin as PinId },
  net: `net_${id}` as NetId,
});

describe('NetAnalyzer', () => {
  it('should return empty nets for no connections', () => {
    const analyzer = new NetAnalyzer([]);
    expect(analyzer.getNets()).toEqual([]);
  });

  it('should group directly connected pins into a net', () => {
    const connections = [
      makeConnection('comp1', 'pin_0', 'comp2', 'pin_1'),
    ];
    const analyzer = new NetAnalyzer(connections);
    const nets = analyzer.getNets();

    expect(nets).toHaveLength(1);
    expect(nets[0].pins).toHaveLength(2);
    expect(nets[0].pins).toContainEqual({ componentId: 'comp1', pinId: 'pin_0' });
    expect(nets[0].pins).toContainEqual({ componentId: 'comp2', pinId: 'pin_1' });
  });

  it('should merge transitively connected pins into one net', () => {
    const connections = [
      makeConnection('comp1', 'pin_0', 'comp2', 'pin_0', 'c1'),
      makeConnection('comp2', 'pin_0', 'comp3', 'pin_0', 'c2'),
    ];
    const analyzer = new NetAnalyzer(connections);
    const nets = analyzer.getNets();

    expect(nets).toHaveLength(1);
    expect(nets[0].pins).toHaveLength(3);
  });

  it('should keep separate nets for unconnected groups', () => {
    const connections = [
      makeConnection('comp1', 'pin_0', 'comp2', 'pin_0', 'c1'),
      makeConnection('comp3', 'pin_0', 'comp4', 'pin_0', 'c2'),
    ];
    const analyzer = new NetAnalyzer(connections);
    const nets = analyzer.getNets();

    expect(nets).toHaveLength(2);
  });

  it('should find the net for a specific pin', () => {
    const connections = [
      makeConnection('comp1', 'pin_0', 'comp2', 'pin_1'),
    ];
    const analyzer = new NetAnalyzer(connections);
    const net = analyzer.getNetForPin('comp1' as ComponentId, 'pin_0' as PinId);

    expect(net).toBeDefined();
    expect(net!.pins).toHaveLength(2);
  });

  it('should return undefined for unconnected pin', () => {
    const analyzer = new NetAnalyzer([]);
    const net = analyzer.getNetForPin('comp1' as ComponentId, 'pin_0' as PinId);

    expect(net).toBeUndefined();
  });
});
