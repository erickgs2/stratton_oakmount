import { Injectable } from '@angular/core';

// Remembers which market tab a page had selected, across a full page
// reload — each page passes its own storage key so their selections stay
// independent (switching tabs on one page doesn't affect another).
@Injectable({ providedIn: 'root' })
export class TabPersistenceService {
  getSavedIndex(key: string, maxIndex: number): number {
    const raw = localStorage.getItem(key);
    const parsed = raw != null ? parseInt(raw, 10) : NaN;
    if (Number.isNaN(parsed) || parsed < 0 || parsed > maxIndex) return 0;
    return parsed;
  }

  saveIndex(key: string, index: number): void {
    localStorage.setItem(key, index.toString());
  }
}
