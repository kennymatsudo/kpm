/**
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 */
  const home = os.homedir();
  return [
    '/opt/homebrew/bin',                      // Homebrew (Apple Silicon)
    path.join(home, '.npm-global/bin'),       // npm global with custom prefix
    path.join(home, '.nvm/current/bin'),      // nvm
    path.join(home, '.fnm/current/bin'),      // fnm
  ];
}

/**
 *
 */
  }


}
