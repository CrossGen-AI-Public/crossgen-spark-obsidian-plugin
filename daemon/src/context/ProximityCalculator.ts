/**
 * Proximity Calculator
 * Calculates distance between files for context ranking
 */

import { dirname, relative, sep } from 'node:path';
import type { IProximityCalculator } from '../types/context.js';

export class ProximityCalculator implements IProximityCalculator {
  /**
   * Calculate distance between two files
   * Distance is based on directory structure proximity
   * Same directory = 0, each level up/down = +1
   */
  public calculateDistance(file1: string, file2: string): number {
    const dir1 = dirname(file1);
    const dir2 = dirname(file2);

    // Same directory
    if (dir1 === dir2) {
      return 0;
    }

    // Calculate relative path
    const relativePath = relative(dir1, dir2);

    // Split by path separator and count segments
    const segments = relativePath.split(sep).filter((seg) => seg && seg !== '.');

    // Count how many ".." segments (going up) and normal segments (going down)
    const upCount = segments.filter((seg) => seg === '..').length;
    const downCount = segments.filter((seg) => seg !== '..').length;

    // Distance is the total number of directory changes
    return upCount + downCount;
  }

  /**
   * Rank files by proximity to a given file
   * Returns sorted array with closest files first
   */
  public rankFilesByProximity(currentFile: string, allFiles: string[]): string[] {
    return allFiles
      .filter((file) => file !== currentFile) // Exclude current file
      .map((file) => ({
        file,
        distance: this.calculateDistance(currentFile, file),
      }))
      .sort((a, b) => {
        // Sort by distance first
        if (a.distance !== b.distance) {
          return a.distance - b.distance;
        }
        // If same distance, sort alphabetically
        return a.file.localeCompare(b.file);
      })
      .map((item) => item.file);
  }

  /**
   * Get files within a certain distance
   */
  public getFilesWithinDistance(
    currentFile: string,
    allFiles: string[],
    maxDistance: number
  ): string[] {
    return allFiles
      .filter((file) => {
        if (file === currentFile) return false;
        const distance = this.calculateDistance(currentFile, file);
        return distance <= maxDistance;
      })
      .sort((a, b) => {
        const distA = this.calculateDistance(currentFile, a);
        const distB = this.calculateDistance(currentFile, b);
        return distA - distB;
      });
  }

  /**
   * Group files by distance
   */
  public groupFilesByDistance(currentFile: string, allFiles: string[]): Map<number, string[]> {
    const grouped = new Map<number, string[]>();

    for (const file of allFiles) {
      if (file === currentFile) continue;

      const distance = this.calculateDistance(currentFile, file);
      const existing = grouped.get(distance) || [];
      existing.push(file);
      grouped.set(distance, existing);
    }

    return grouped;
  }
}
