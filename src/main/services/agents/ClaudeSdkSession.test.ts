import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaudeSdkSession } from './ClaudeSdkSession';

  processMessage(msg: object): void;
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
