import { generateName } from './nameGenerator';

export type Hat = 'none' | 'helm' | 'chef' | 'tophat' | 'beanie' | 'cowboy' | 'party' | 'viking' | 'santa';
export type TankColorKey = 'red' | 'blue' | 'green' | 'orange' | 'cyan' | 'purple' | 'yellow' | 'pink' | 'lime' | 'white';

export interface StoredIdentity {
  name: string;
  color: TankColorKey;
  hat: Hat;
}

const STORAGE_KEY = 'scorched_identity';
const ALL_COLORS: TankColorKey[] = ['red','blue','green','orange','cyan','purple','yellow','pink','lime','white'];

function randomColor(): TankColorKey {
  return ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)]!;
}

function freshIdentity(): StoredIdentity {
  return { name: generateName(), color: randomColor(), hat: 'none' };
}

export function loadIdentity(): StoredIdentity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredIdentity;
      if (parsed.name && parsed.name.length > 0 && parsed.color && parsed.hat) {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return freshIdentity();
}

export function saveIdentity(id: StoredIdentity): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(id));
  } catch { /* ignore */ }
}
