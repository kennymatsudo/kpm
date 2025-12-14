    // Clean up legacy built-in prompts (Weekly Update, Test Plan) that were
    // removed. Rows with is_builtin=1 cannot be deleted through the UI, so
    // existing installs would otherwise carry them forever.
    this.db
      .prepare(
        `DELETE FROM custom_prompts WHERE is_builtin = 1 AND name IN ('Weekly Update', 'Test Plan')`
      )
      .run();

    // No built-in prompts are currently shipped. Kept as a hook for future
    // built-in seeding so startup callers don't need to change.
