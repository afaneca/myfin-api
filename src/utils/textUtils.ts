/**
 * Parses a semantic version string into its component parts (major, minor, patch).
 *
 * @param version - The version string to parse.
 * @returns An array of numbers representing the major, minor, and patch versions,
 * or null if the version string is invalid.
 */
const parseVersion = (version: string): number[] | null => {
  const parts = version.split('.').map(num => parseInt(num, 10));
  if (parts.length !== 3 || parts.some(isNaN)) {
    return null; // Invalid semantic version format
  }
  return parts;
};

/**
 * Checks if versionA is older than versionB.
 *
 * @param versionA - The version to check if it's older.
 * @param versionB - The version to compare against.
 * @param inclusive - If true, allows versions to be considered "older or equal".
 * @returns true if versionA is older (or older/equal if inclusive), otherwise false.
 */
export function isVersionOlder(versionA: string, versionB: string, inclusive = false): boolean {

  const [majorA, minorA, patchA] = parseVersion(versionA);
  const [majorB, minorB, patchB] = parseVersion(versionB);

  if (majorA !== majorB) {
    return majorA < majorB || (inclusive && majorA === majorB);
  }
  if (minorA !== minorB) {
    return minorA < minorB || (inclusive && minorA === minorB);
  }
  if (patchA !== patchB) {
    return patchA < patchB || (inclusive && patchA === patchB);
  }

  // If all are equal
  return inclusive;
}

/**
 * Checks if two semantic version strings belong to the same major version.
 *
 * @param versionA - The first version string.
 * @param versionB - The second version string.
 * @returns `true` if both versions have the same major version, `false` otherwise.
 */
export function isSameMajorVersion(versionA: string, versionB: string): boolean {

  const partsA = parseVersion(versionA);
  const partsB = parseVersion(versionB);

  if (!partsA || !partsB) {
    return false; // Handle invalid version strings
  }

  return partsA[0] === partsB[0];
}