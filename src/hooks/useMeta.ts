import { useEffect, useSyncExternalStore } from 'react';
import { initMeta, metaStore, type MetaState } from '../services/metaService';

/** Current meta comps + provenance. Triggers a (TTL-guarded) remote refresh on mount. */
export function useMeta(): MetaState {
  useEffect(() => {
    void initMeta();
  }, []);
  return useSyncExternalStore(metaStore.subscribe, metaStore.get);
}
