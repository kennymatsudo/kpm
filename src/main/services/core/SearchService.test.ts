type SearchEntityType = 'plan_item' | 'document';
      external_key, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      entityType: 'plan_item',
      entityId: 'item-3',
      statusCategory: 'not_started',
  it('finds plan items by description body', async () => {
      const matched = result.data.filter((r) => r.id === 'item-3');
      expect(matched.length).toBe(1);
