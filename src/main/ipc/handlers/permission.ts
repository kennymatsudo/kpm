/**
 * IPC handlers for permission system.
 *
 * Flow:
 * 1. Main process needs permission -> calls promptUser()
 * 2. promptUser() sends permission:request to renderer
 * 3. Renderer shows inline PermissionPrompt component
 * 4. User clicks action -> renderer sends permission:respond
 * 5. promptUser() resolves with PermissionResult
 */

/**
 * Register permission IPC handlers.
 */
  /**
   * Handle permission response from renderer.
   */
}
