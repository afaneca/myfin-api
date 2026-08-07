import { describe, expect, test } from 'vitest';
import { CATEGORY_ICON_KEYS } from '../../src/consts.js';
import CategoryService from '../../src/services/categoryService.js';
import { mockedPrisma } from './prisma.mock.js';

describe('categoryService', () => {
  test('creates categories with a valid icon key', async () => {
    const category = {
      name: 'Travel',
      color_gradient: 'blue-gradient',
      icon_key: 'travel',
      type: 'M',
      users_user_id: 1n,
    };
    mockedPrisma.categories.create.mockResolvedValue(category as never);

    await CategoryService.createCategory(category, mockedPrisma);

    expect(mockedPrisma.categories.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ icon_key: 'travel' }),
    });
  });

  test('falls back to the default icon for old or unknown data', async () => {
    mockedPrisma.categories.create.mockResolvedValue({} as never);

    await CategoryService.createCategory(
      { name: 'Legacy', icon_key: 'removed-icon' },
      mockedPrisma
    );

    expect(mockedPrisma.categories.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ icon_key: 'category' }),
    });
  });
  test('exposes at least thirty predefined icon keys', () => {
    expect(CATEGORY_ICON_KEYS.length).toBeGreaterThanOrEqual(30);
  });
});
