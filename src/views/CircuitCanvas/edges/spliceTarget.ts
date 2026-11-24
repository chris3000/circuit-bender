import { createContext, useContext } from 'react';

/** The wire a part held over the canvas would land in if it were let go of now (a connection id), if any. */
export const SpliceTargetContext = createContext<string | null>(null);

/** Whether this wire is the one a held part would land in. */
export function useIsSpliceTarget(connectionId: string): boolean {
  return useContext(SpliceTargetContext) === connectionId;
}
