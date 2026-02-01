import { describe, expect, test } from 'vitest';
import TagService from '../../src/services/tagService.js';
import { mockedPrisma } from './prisma.mock.js';

describe('tagService', () => {
  test('getAllTagsForUser should filter by username and select attributes', async () => {
    const userId = 1n;
    const selectAttributes = { name: true };
    mockedPrisma.tags.findMany.mockResolvedValue([
      { tag_id: 1, description: 'test', name: 'test', users_user_id: userId },
      { tag_id: 2, description: 'test2', name: 'test2', users_user_id: userId },
    ]);
    const tags = await TagService.getAllTagsForUser(userId, selectAttributes, mockedPrisma);

    expect(mockedPrisma.tags.findMany).toHaveBeenCalledWith({
      where: { users_user_id: userId },
      select: selectAttributes,
    });
    expect(tags.length).toBe(2);
  });

  test('createTag should create a new tag with expected attributes', async () => {
    const tag = {
      name: 'test',
      description: 'description',
      users_user_id: 1,
    };

    mockedPrisma.tags.create.mockResolvedValue(tag);
    await TagService.createTag(tag, mockedPrisma);

    // Verify the exact data passed to create
    expect(mockedPrisma.tags.create).toHaveBeenCalledWith({
      data: { ...tag },
    });
  });
});
