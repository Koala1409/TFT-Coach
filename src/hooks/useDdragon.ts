import { useEffect, useSyncExternalStore } from 'react';
import { ddragonStore, initDdragon, type DdragonData } from '../services/ddragonService';

/** Data Dragon data (null until first load). Re-renders when a new patch is fetched. */
export function useDdragon(): DdragonData | null {
  useEffect(() => {
    void initDdragon();
  }, []);
  return useSyncExternalStore(ddragonStore.subscribe, ddragonStore.get);
}
