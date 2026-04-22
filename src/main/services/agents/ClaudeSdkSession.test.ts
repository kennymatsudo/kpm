import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaudeSdkSession } from './ClaudeSdkSession';
import type { AgentActivity, AgentCompletionSummary } from '../../../shared/agent-types';

  processMessage(msg: object): void;
  getCompletionSummary: () => Promise<AgentCompletionSummary>;
  setState(state: string): void;
}

}

  });


    const states: string[] = [];
    session.on('onStateChange', (state) => {
      states.push(state);
    });

      type: 'system',
      subtype: 'init',
      session_id: 'sdk-session-id',
    });

    expect(session.state).toBe('working');
    expect(states).toContain('working');
  });


      type: 'assistant',
      message: {
        content: [{ type: 'thinking', thinking: 'planning' }],
      },
    });

    expect(session.state).toBe('working');
  });

    });



    expect(session.state).toBe('complete');
  });








  });



  });





  });



  });



  });

  it('emits a system activity when a task_progress message includes a summary', () => {

    const activities: AgentActivity[] = [];
    session.on('onActivity', (a) => activities.push(a));

      type: 'system',
      subtype: 'task_progress',
      task_id: 'task-1',
      description: 'Running subagent',
      summary: 'Analyzing authentication module',
      usage: { total_tokens: 0, tool_uses: 0, duration_ms: 0 },
      session_id: 'sdk-session-id',
    });

    const progress = activities.find((a) => a.summary === 'Analyzing authentication module');
    expect(progress).toBeDefined();
    expect(progress?.type).toBe('system');
  });

  it('deduplicates repeated task_progress summaries within a turn', () => {

    const activities: AgentActivity[] = [];
    session.on('onActivity', (a) => activities.push(a));

    const payload = {
      type: 'system',
      subtype: 'task_progress',
      task_id: 'task-1',
      description: 'Running subagent',
      summary: 'Analyzing authentication module',
      usage: { total_tokens: 0, tool_uses: 0, duration_ms: 0 },
      session_id: 'sdk-session-id',
    };

    const matches = activities.filter((a) => a.summary === 'Analyzing authentication module');
    expect(matches).toHaveLength(1);
  });
});
