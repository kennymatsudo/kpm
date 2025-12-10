import { chromium } from 'playwright';
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CDP_PORT = 9222;

  window: Page;
}





        }





    const window = pages[0];

    if (!window) {
      throw new Error('No window found');
    }

    await use(window);
  },
});

