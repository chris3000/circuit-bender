import type { EdgeTypes } from 'reactflow';
import { SchematicEdge } from './SchematicEdge';
import { BoardEdge } from './BoardEdge';

export const edgeTypes: EdgeTypes = {
  schematic: SchematicEdge,
  board: BoardEdge,
};
