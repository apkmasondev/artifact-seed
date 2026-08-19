import { useSyncExternalStore } from 'react'

interface ReadableStore<T> {
  get: () => T
  subscribe: (listener: (value: T) => void) => () => void
}

export function useStore<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
