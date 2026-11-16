import type { Camalot, GameId } from './contract';

// All storage goes through this file. Today it is this device's localStorage.
// Every access is wrapped: private browsing or a full disk must never crash a game.

export function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Per-player, per-game save. A cloud store replaces this one function. */
export function saveFor(playerId: string, game: GameId): Camalot['save'] {
  const key = `camalot.save.${playerId}.${game}`;
  return {
    load: async <T>() => readLocal<T>(key),
    store: async <T>(data: T) => {
      if (!writeLocal(key, data)) throw new Error('Camalot could not save on this device.');
    },
  };
}
