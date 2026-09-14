import { useMemo, useSyncExternalStore } from 'react'
import { aiAvailable, configVersion, keyStatus, readPrefs, subscribeConfig, type KeyStatus } from './config'

export function useAiConfig() {
  const version = useSyncExternalStore(subscribeConfig, configVersion, configVersion)
  return useMemo(
    () => ({
      version,
      available: aiAvailable(),
      status: keyStatus() as KeyStatus,
      prefs: readPrefs(),
    }),
    [version],
  )
}