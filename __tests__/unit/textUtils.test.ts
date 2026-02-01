import { describe, expect, test } from 'vitest';
import { isSameMajorVersion, isVersionOlder } from '../../src/utils/textUtils.js';

describe('textUtils', () => {
  describe('isVersionOlder', () => {
    test('should return true when versionA is older than versionB', () => {
      expect(isVersionOlder('1.0.0', '2.0.0')).toBe(true);
      expect(isVersionOlder('2.1.0', '2.2.0')).toBe(true);
      expect(isVersionOlder('2.2.1', '2.2.2')).toBe(true);
      expect(isVersionOlder('0.9.9', '1.0.0')).toBe(true);
    });

    test('should return false when versionA is newer than versionB', () => {
      expect(isVersionOlder('2.0.0', '1.0.0')).toBe(false);
      expect(isVersionOlder('2.2.0', '2.1.0')).toBe(false);
      expect(isVersionOlder('2.2.2', '2.2.1')).toBe(false);
      expect(isVersionOlder('1.0.0', '0.9.9')).toBe(false);
    });

    test('should return false when versions are equal and inclusive is false', () => {
      expect(isVersionOlder('1.0.0', '1.0.0')).toBe(false);
      expect(isVersionOlder('2.2.2', '2.2.2')).toBe(false);
    });

    test('should return true when versions are equal and inclusive is true', () => {
      expect(isVersionOlder('1.0.0', '1.0.0', true)).toBe(true);
      expect(isVersionOlder('2.2.2', '2.2.2', true)).toBe(true);
    });

    test('should correctly handle mixed cases', () => {
      expect(isVersionOlder('2.0.0', '2.0.1')).toBe(true);
      expect(isVersionOlder('2.0.1', '2.0.0')).toBe(false);
      expect(isVersionOlder('2.1.0', '2.1.0', true)).toBe(true);
      expect(isVersionOlder('2.1.0', '2.1.0', false)).toBe(false);
    });

    test('should handle leading zeros correctly', () => {
      expect(isVersionOlder('01.0.0', '1.0.1')).toBe(true);
      expect(isVersionOlder('1.00.0', '1.0.1')).toBe(true);
      expect(isVersionOlder('1.0.01', '1.0.1')).toBe(false);
    });
  });

  describe('isSameMajorVersion', () => {
    test('should return true when versions have the same major version', () => {
      expect(isSameMajorVersion('1.0.0', '1.2.3')).toBe(true);
      expect(isSameMajorVersion('2.5.1', '2.9.0')).toBe(true);
      expect(isSameMajorVersion('1.0.0-alpha', '1.0.0-beta')).toBe(true);
    });

    test('should return false when versions have different major versions', () => {
      expect(isSameMajorVersion('1.0.0', '2.0.0')).toBe(false);
      expect(isSameMajorVersion('2.3.4', '3.0.0')).toBe(false);
      expect(isSameMajorVersion('0.1.0', '1.0.0')).toBe(false);
    });

    test('should handle invalid version strings', () => {
      expect(isSameMajorVersion('1.0', '1.0.0')).toBe(false);
      expect(isSameMajorVersion('1.0.0', '1.0.a')).toBe(false);
      expect(isSameMajorVersion('a.b.c', '1.0.0')).toBe(false);
      expect(isSameMajorVersion('1.0.0', '1')).toBe(false);
    });
    test('should handle leading zeros', () => {
      expect(isSameMajorVersion('01.0.0', '1.2.3')).toBe(true);
      expect(isSameMajorVersion('1.01.0', '1.2.3')).toBe(true);
    });
  });
});
