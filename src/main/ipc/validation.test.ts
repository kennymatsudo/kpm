/**
 *
 */

import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  ProjectSchemas,
  PlanSchemas,
  ChatSchemas,
  TrackerSchemas,
  ExportSchemas,
  StreamingSessionSchemas,
} from './validation';

describe('ValidationError', () => {
  it('formats single error correctly', () => {
    const result = ProjectSchemas.create.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = new ValidationError(result.error);
      expect(error.message).toContain('Validation failed');
      expect(error.name).toBe('ValidationError');
    }
  });

  it('includes field path in error message', () => {
    const result = ProjectSchemas.update.safeParse({
      projectId: 'not-a-uuid',
      updates: { name: 'Valid' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = new ValidationError(result.error);
      expect(error.message).toContain('projectId');
    }
  });
});

describe('ProjectSchemas', () => {
  describe('create', () => {

      const result = ProjectSchemas.create.safeParse({ name: '  Trimmed  ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Trimmed');
      }
    });

    });
  });

  describe('get', () => {
    });
  });

  describe('update', () => {
    });

    });
  });
});

describe('PlanSchemas', () => {
  describe('updatePosition', () => {
    });

    });
  });

  describe('updateItem', () => {
    });

    });
  });

  describe('executeActions', () => {
          {
            type: 'create_item',
            title: 'New Feature',
            parent_id: null,
            status: 'planned',
            label: 'feature',
          },
        ],
          {
            type: 'set_position',
            x: 100,
            y: 200,
          },
        ],
          { type: 'create_item', title: 'Item 1', parent_id: null },
        ],
    });

    });
  });

  describe('addRelation', () => {
        });
      }
    });

        relation_type: 'invalid',
      });
    });
  });
});

describe('ChatSchemas', () => {
  describe('send', () => {
    });

    });
  });
});

describe('TrackerSchemas', () => {
  describe('saveJiraCredentials', () => {
        siteUrl: 'company.atlassian.net',
        email: 'user@example.com',
        apiToken: 'token123',
      });

      }
    });

      }
    });
  });

  describe('addScope', () => {
    });

    });
  });
});

describe('ExportSchemas', () => {
  describe('addToQueue', () => {
      });
        itemIds: [],
      });
    });
  });

  describe('updateQueueStatus', () => {

        statusCategory: 'invalid',
      });
    });
  });

  describe('updateQueueCustomFields', () => {
          customfield_123: 'value',
          customfield_456: '999',
        },
    });
  });

  describe('saveMapping', () => {
        trackerIssueTypeId: '10001',
        trackerIssueTypeName: 'Task',

    });
  });
});

describe('StreamingSessionSchemas', () => {
    });
  });

    });
  });
});
