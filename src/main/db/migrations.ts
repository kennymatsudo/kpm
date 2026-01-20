import type { Database as BetterSqliteDatabase } from 'better-sqlite3';

/**
 *
 * Each migration is a function that receives the database instance and applies
 * schema changes. Migrations are run in order and tracked in the schema_migrations table.
 *
 * IMPORTANT: Once a migration is deployed, it should NEVER be modified.
 * Create a new migration instead.
 */

interface Migration {
  id: number;
  name: string;
  up: (db: BetterSqliteDatabase) => void;
}

/**
 * All migrations in order. Add new migrations to the end of this array.
 * Migrations run automatically on app start.
 */
  {
    id: 1,
    name: '001_initial_schema',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- CORE TABLES
        -- ============================================
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          folder_path TEXT NOT NULL,
          session_id TEXT,
          phase TEXT NOT NULL DEFAULT 'discovery',
          session_tokens INTEGER DEFAULT 0,
          session_input_tokens INTEGER DEFAULT 0,
          session_output_tokens INTEGER DEFAULT 0,
          storybook_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS repos (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          path TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS attachments (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          path TEXT NOT NULL,
          filename TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ============================================
        -- TRACKER CONNECTIONS: Site-level authentication
        -- Credentials stored in OS keychain via keytar, not in DB
        -- ============================================
        CREATE TABLE IF NOT EXISTS tracker_connections (
          id TEXT PRIMARY KEY,
          tracker_type TEXT NOT NULL,            -- 'jira' | 'linear'
          site_url TEXT NOT NULL,                -- 'company.atlassian.net'
          display_name TEXT,                     -- Human-friendly name
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(tracker_type, site_url)
        );

        -- ============================================
        -- TRACKER PROJECT SCOPES: Authorization pools
        -- Defines which Tracker Projects we can access (Jira/Linear)
        -- ============================================
        CREATE TABLE IF NOT EXISTS tracker_project_scopes (
          id TEXT PRIMARY KEY,
          connection_id TEXT NOT NULL REFERENCES tracker_connections(id) ON DELETE CASCADE,
          project_key TEXT NOT NULL,             -- 'PROJ' (Jira) or team slug (Linear)
          project_name TEXT,                     -- 'Sample Project'
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(connection_id, project_key)
        );

        -- ============================================
        -- ============================================
        CREATE TABLE IF NOT EXISTS kpm_tracker_associations (
          id TEXT PRIMARY KEY,
          kpm_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          scope_id TEXT NOT NULL REFERENCES tracker_project_scopes(id) ON DELETE CASCADE,
          jql_filter TEXT NOT NULL,              -- 'parent = PROJ-6224' (Jira) or filter query (Linear)
          display_name TEXT,                     -- 'Support Pane Epic'
          last_synced_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ============================================
        -- PLAN ITEMS: Core planning data with external tracker fields
        -- ============================================
        CREATE TABLE IF NOT EXISTS plan_items (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          parent_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          label TEXT,
          item_order INTEGER NOT NULL,
          code_refs TEXT,
          status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('backlog', 'planned')),
          release_tag TEXT,
          position_x REAL,
          position_y REAL,
          -- External tracker fields
          association_id TEXT REFERENCES kpm_tracker_associations(id) ON DELETE SET NULL,
          external_key TEXT,                     -- 'PROJ-123' or 'TEAM-456'
          external_id TEXT,                      -- API ID (Jira ID or Linear UUID)
          external_type TEXT,                    -- 'jira' | 'linear'
          external_issue_type TEXT,              -- Original issue type: 'Story', 'Sub-task', etc.
          external_status TEXT,                  -- Status from tracker (display only)
          external_url TEXT,                     -- Direct link to issue
          external_parent_key TEXT,              -- Parent issue key (for sub-tasks)
          external_epic_key TEXT,                -- Epic/project key (metadata only)
          sync_source TEXT DEFAULT 'local',      -- 'local' | 'jira' | 'linear'
          last_synced_at DATETIME,
          completed_at DATETIME,                 -- When item was marked done (for artifact generation)
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS plan_relations (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          from_item_id TEXT NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
          to_item_id TEXT NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
          relation_type TEXT NOT NULL CHECK(relation_type IN ('depends_on', 'blocks', 'relates_to')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ============================================
        -- SYNC SNAPSHOTS: For three-way conflict detection
        -- ============================================
        CREATE TABLE IF NOT EXISTS sync_snapshots (
          id TEXT PRIMARY KEY,
          plan_item_id TEXT NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
          snapshot_title TEXT,
          snapshot_description TEXT,
          snapshot_label TEXT,
          snapshot_release_tag TEXT,
          external_updated_at DATETIME,          -- Tracker's last modified timestamp
          snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(plan_item_id)
        );

        -- ============================================
        -- Per-project configuration for how labels map to tracker types (Jira/Linear)
        -- ============================================
        CREATE TABLE IF NOT EXISTS tracker_type_mappings (
          id TEXT PRIMARY KEY,
          kpm_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          scope_id TEXT NOT NULL REFERENCES tracker_project_scopes(id) ON DELETE CASCADE,
          kpm_label TEXT NOT NULL,               -- 'epic', 'story', 'task', etc.
          tracker_issue_type_id TEXT NOT NULL,   -- Tracker issue type ID
          tracker_issue_type_name TEXT NOT NULL, -- 'Epic', 'Story', 'Task', 'Sub-task'
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(kpm_project_id, scope_id, kpm_label)
        );

        -- ============================================
        -- SYNC QUEUE: Items staged for push to tracker
        -- Staging area for selective export (like git staging)
        -- ============================================
        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY,
          kpm_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          plan_item_id TEXT NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
          association_id TEXT NOT NULL REFERENCES kpm_tracker_associations(id) ON DELETE CASCADE,
          operation TEXT NOT NULL CHECK(operation IN ('create', 'update')),
          target_issue_type_id TEXT,             -- Resolved tracker type (null until preview)
          target_issue_type_name TEXT,
          target_parent_key TEXT,                -- Tracker parent key if creating sub-issue
          target_status_category TEXT CHECK(target_status_category IN ('not_started', 'in_progress', 'done', 'blocked', 'canceled')),  -- Status to sync
          queued_by TEXT NOT NULL CHECK(queued_by IN ('user', 'claude')),
          queued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          error_message TEXT,                    -- Populated if push fails
          UNIQUE(plan_item_id)                   -- One queue entry per item
        );

        -- ============================================
        -- INDEXES
        -- ============================================
        CREATE INDEX IF NOT EXISTS idx_repos_project ON repos(project_id);
        CREATE INDEX IF NOT EXISTS idx_attachments_project ON attachments(project_id);
        CREATE INDEX IF NOT EXISTS idx_plan_items_project ON plan_items(project_id);
        CREATE INDEX IF NOT EXISTS idx_plan_items_association ON plan_items(association_id);
        CREATE INDEX IF NOT EXISTS idx_plan_items_parent_project ON plan_items(project_id, parent_id);
        CREATE INDEX IF NOT EXISTS idx_plan_items_status_project ON plan_items(project_id, status);
        CREATE INDEX IF NOT EXISTS idx_plan_items_status_category_project ON plan_items(project_id, status_category);
        CREATE INDEX IF NOT EXISTS idx_plan_items_label_project ON plan_items(project_id, label);
        CREATE INDEX IF NOT EXISTS idx_plan_items_release_tag_project ON plan_items(project_id, release_tag);
        CREATE INDEX IF NOT EXISTS idx_plan_relations_project ON plan_relations(project_id);
        CREATE INDEX IF NOT EXISTS idx_plan_relations_from ON plan_relations(from_item_id);
        CREATE INDEX IF NOT EXISTS idx_plan_relations_to ON plan_relations(to_item_id);
        CREATE INDEX IF NOT EXISTS idx_sync_snapshots_plan_item ON sync_snapshots(plan_item_id);
        CREATE INDEX IF NOT EXISTS idx_tracker_project_scopes_connection ON tracker_project_scopes(connection_id);
        CREATE INDEX IF NOT EXISTS idx_kpm_tracker_associations_project ON kpm_tracker_associations(kpm_project_id);
        CREATE INDEX IF NOT EXISTS idx_kpm_tracker_associations_scope ON kpm_tracker_associations(scope_id);
        CREATE INDEX IF NOT EXISTS idx_tracker_type_mappings_project ON tracker_type_mappings(kpm_project_id);
        CREATE INDEX IF NOT EXISTS idx_tracker_type_mappings_scope ON tracker_type_mappings(scope_id);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_project ON sync_queue(kpm_project_id);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_association ON sync_queue(association_id);

        -- ============================================
        -- BRAINSTORM SESSIONS: Isolated exploration spaces
        -- ============================================
        CREATE TABLE IF NOT EXISTS brainstorm_sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          title TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'merged', 'discarded')),
          claude_session_id TEXT,
          artifact_path TEXT,
          message_count INTEGER NOT NULL DEFAULT 0,
          agent_type TEXT NOT NULL DEFAULT 'general',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_project ON brainstorm_sessions(project_id);
        CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_status ON brainstorm_sessions(status);

        -- ============================================
        -- SCHEMA MIGRATIONS: Track applied migrations
        -- ============================================
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ============================================
        -- CHAT MESSAGES: Unified persistent chat history for session recovery
        -- Supports both main project chat and brainstorm sessions
        -- ============================================
        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          session_type TEXT NOT NULL CHECK (session_type IN ('main', 'brainstorm')),
          session_id TEXT NOT NULL,  -- project_id for main chat, brainstorm_id for brainstorm
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_type, session_id);
      `);

      // Partial unique index for external key lookups (separate statement due to WHERE clause)
      try {
        db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_items_external_key
          ON plan_items(project_id, external_type, external_key)
          WHERE external_key IS NOT NULL
        `);
      } catch (error) {
        // Only ignore "already exists" errors, log others
        if (error instanceof Error && !error.message.includes('already exists')) {
          console.error('[Database] Unexpected error creating index:', error);
        }
      }
    },
  },
  {
    id: 2,
    name: '002_add_completed_at',
    up: (db: BetterSqliteDatabase) => {
      // Check if column already exists (it's now in initial schema)
      const columns = db.prepare("PRAGMA table_info(plan_items)").all() as { name: string }[];
      const hasColumn = columns.some((col) => col.name === 'completed_at');

      if (!hasColumn) {
        db.exec(`
          -- Add completed_at column for tracking when items are marked done
          -- Used for weekly update artifact generation
          ALTER TABLE plan_items ADD COLUMN completed_at DATETIME;
        `);
      }
    },
  },
  {
    id: 3,
    name: '003_add_scratchpad',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- SCRATCHPAD: Quick capture for notes and action items
        -- ============================================
        CREATE TABLE IF NOT EXISTS scratchpad_items (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          ai_context TEXT,                         -- Future: Claude-generated enrichment
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
          converted_to_plan_item_id TEXT,          -- Future: Track if converted to plan item
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_scratchpad_items_project ON scratchpad_items(project_id);
        CREATE INDEX IF NOT EXISTS idx_scratchpad_items_status ON scratchpad_items(project_id, status);
      `);
    },
  },
  {
    id: 1004,
    name: '004_custom_agents',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- CUSTOM BRAINSTORM AGENTS
        -- User-defined personas for brainstorming
        -- ============================================
        CREATE TABLE IF NOT EXISTS custom_agents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          persona TEXT NOT NULL,
          expertise TEXT NOT NULL,
          conversation_style TEXT NOT NULL,
          summary_guidance TEXT,
          empty_state_prompt TEXT,
          dot_color TEXT DEFAULT '#a78bfa',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    },
  },
  {
    id: 1005,
    name: '005_ticket_templates',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- TICKET TEMPLATES: Tracker-agnostic ticket formatting
        -- Templates for how tickets are created in Jira, Linear, etc.
        -- project_id = NULL means global template
        -- ============================================
        CREATE TABLE IF NOT EXISTS ticket_templates (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL DEFAULT 'default',
          title_template TEXT NOT NULL DEFAULT '{{title}}',
          description_template TEXT NOT NULL DEFAULT '## Context

{{description}}

## Acceptance Criteria

- [ ] TBD

## Technical Notes

',
          is_default BOOLEAN NOT NULL DEFAULT false,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, name)
        );

        CREATE INDEX IF NOT EXISTS idx_ticket_templates_project ON ticket_templates(project_id);
      `);
    },
  },
  {
    id: 1006,
    name: '006_association_status_mapping',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- Add status_mapping to tracker associations
        -- e.g., {"in_progress": "In Progress", "done": "Done"}
        -- ============================================
        ALTER TABLE kpm_tracker_associations ADD COLUMN status_mapping TEXT;
      `);
    },
  },
  {
    id: 1007,
    name: '007_agent_worktrees',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- WORKTREES: Git worktrees for agent development
        -- Links plan items to git worktrees for isolated development
        -- ============================================
        CREATE TABLE IF NOT EXISTS worktrees (
          id TEXT PRIMARY KEY,
          plan_item_id TEXT NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          worktree_path TEXT NOT NULL,
          branch_name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(plan_item_id)
        );

        CREATE INDEX IF NOT EXISTS idx_worktrees_project ON worktrees(project_id);
        CREATE INDEX IF NOT EXISTS idx_worktrees_plan_item ON worktrees(plan_item_id);

        -- Add agent_instructions column to projects
        ALTER TABLE projects ADD COLUMN agent_instructions TEXT;
      `);
    },
  },
  {
    id: 1008,
    name: '008_app_settings',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- APP SETTINGS: Global key-value preferences
        -- ============================================
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Set default terminal preference
        INSERT OR IGNORE INTO app_settings (key, value) VALUES ('terminal_app', 'ghostty');
      `);
    },
  },
  {
    id: 1009,
    name: '009_dev_sessions',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- DEV SESSIONS: Plan item implementation sessions
        -- Each session runs Claude Code in an isolated git worktree
        -- ============================================
        CREATE TABLE IF NOT EXISTS dev_sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          plan_item_id TEXT NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
          repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,

          -- Git worktree
          worktree_path TEXT NOT NULL,
          branch_name TEXT NOT NULL,
          base_branch TEXT NOT NULL DEFAULT 'main',

          -- Status: pending, running, waiting, completed, failed, interrupted, abandoned
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'waiting', 'completed', 'failed', 'interrupted', 'abandoned')),

          -- Context passed to Claude Code
          initial_instructions TEXT NOT NULL,

          -- Timestamps
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME
        );

        CREATE INDEX IF NOT EXISTS idx_dev_sessions_project ON dev_sessions(project_id);
        CREATE INDEX IF NOT EXISTS idx_dev_sessions_plan_item ON dev_sessions(plan_item_id);
        CREATE INDEX IF NOT EXISTS idx_dev_sessions_status ON dev_sessions(project_id, status);
      `);
    },
  },
  {
    id: 1010,
    name: '010_cleanup_orphaned_sessions',
    up: (db: BetterSqliteDatabase) => {
      // Clean up dev_sessions where the plan_item was deleted
      // (foreign keys were not enforced before, leaving orphans)
      // Using NOT EXISTS for better performance on large tables vs NOT IN
      db.exec(`
        DELETE FROM dev_sessions
        WHERE NOT EXISTS (
          SELECT 1 FROM plan_items WHERE plan_items.id = dev_sessions.plan_item_id
        );
      `);
      // Also clean up worktrees for the same reason
      db.exec(`
        DELETE FROM worktrees
        WHERE NOT EXISTS (
          SELECT 1 FROM plan_items WHERE plan_items.id = worktrees.plan_item_id
        );
      `);
    },
  },
  {
    id: 1011,
    name: '011_plan_items_project_order_index',
    up: (db: BetterSqliteDatabase) => {
      // Composite index for the most common query pattern:
      // SELECT * FROM plan_items WHERE project_id = ? ORDER BY item_order
      // This allows the index to handle both filtering AND sorting without filesort.
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_plan_items_project_order
        ON plan_items(project_id, item_order);
      `);
    },
  },
  {
    id: 1012,
    name: '012_remove_backlog_status',
    up: (db: BetterSqliteDatabase) => {
      // Remove backlog status - all items are now 'planned'
      // 1. Update existing backlog items to planned
      // 2. Recreate table with new CHECK constraint (SQLite limitation)
      db.exec(`
        -- First update all backlog items to planned
        UPDATE plan_items SET status = 'planned' WHERE status = 'backlog';

        -- Recreate table with simplified status constraint (only 'planned')
        CREATE TABLE plan_items_new (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          parent_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          label TEXT,
          item_order INTEGER NOT NULL,
          code_refs TEXT,
          status TEXT NOT NULL DEFAULT 'planned' CHECK(status = 'planned'),
          release_tag TEXT,
          position_x REAL,
          position_y REAL,
          association_id TEXT REFERENCES kpm_tracker_associations(id) ON DELETE SET NULL,
          external_key TEXT,
          external_id TEXT,
          external_type TEXT,
          external_issue_type TEXT,
          external_status TEXT,
          status_category TEXT CHECK(status_category IN ('not_started', 'in_progress', 'done', 'blocked', 'canceled', 'none')),
          external_url TEXT,
          external_parent_key TEXT,
          external_epic_key TEXT,
          sync_source TEXT DEFAULT 'local',
          last_synced_at DATETIME,
          completed_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Copy all data
        INSERT INTO plan_items_new SELECT * FROM plan_items;

        -- Drop old table and rename new one
        DROP TABLE plan_items;
        ALTER TABLE plan_items_new RENAME TO plan_items;

        -- Recreate all indexes
        CREATE INDEX idx_plan_items_project ON plan_items(project_id);
        CREATE INDEX idx_plan_items_association ON plan_items(association_id);
        CREATE INDEX idx_plan_items_parent_project ON plan_items(project_id, parent_id);
        CREATE INDEX idx_plan_items_status_project ON plan_items(project_id, status);
        CREATE INDEX idx_plan_items_status_category_project ON plan_items(project_id, status_category);
        CREATE INDEX idx_plan_items_label_project ON plan_items(project_id, label);
        CREATE INDEX idx_plan_items_release_tag_project ON plan_items(project_id, release_tag);
        CREATE INDEX idx_plan_items_project_order ON plan_items(project_id, item_order);

        -- Recreate partial unique index for external key lookups
        CREATE UNIQUE INDEX idx_plan_items_external_key
        ON plan_items(project_id, external_type, external_key)
        WHERE external_key IS NOT NULL;
      `);
    },
  },
  {
    id: 1013,
    name: '013_simplify_dev_session_status',
    up: (db: BetterSqliteDatabase) => {
      // Check if dev_sessions table already has simplified status
      // (may have been migrated earlier or in a different order)
      const tableInfo = db.prepare("PRAGMA table_info(dev_sessions)").all() as { name: string }[];
      if (!tableInfo.some((col) => col.name === 'status')) {
        return; // Table doesn't exist yet or has no status column
      }

      // Try to detect if already migrated by checking existing statuses
      const oldStatuses = db.prepare("SELECT DISTINCT status FROM dev_sessions").all() as { status: string }[];
      const hasOldStatuses = oldStatuses.some((s) => ['running', 'waiting', 'completed', 'failed', 'interrupted', 'abandoned'].includes(s.status));

      if (!hasOldStatuses) {
        return; // Already migrated or empty
      }

      // Simplify dev session statuses from 7 to 3:
      // - pending → pending (unchanged)
      // - running, waiting → active
      // - completed, failed, interrupted, abandoned → inactive
      //
      // SQLite doesn't support modifying CHECK constraints, so we recreate the table.
      db.exec(`
        -- Create new table with simplified status constraint
        CREATE TABLE dev_sessions_new (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          plan_item_id TEXT NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
          repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          worktree_path TEXT NOT NULL,
          branch_name TEXT NOT NULL,
          base_branch TEXT NOT NULL DEFAULT 'main',
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'inactive')),
          initial_instructions TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME
        );

        -- Copy data with status mapping
        INSERT INTO dev_sessions_new (
          id, project_id, plan_item_id, repo_id,
          worktree_path, branch_name, base_branch,
          status, initial_instructions,
          created_at, updated_at, completed_at
        )
        SELECT
          id, project_id, plan_item_id, repo_id,
          worktree_path, branch_name, base_branch,
          CASE status
            WHEN 'pending' THEN 'pending'
            WHEN 'running' THEN 'active'
            WHEN 'waiting' THEN 'active'
            ELSE 'inactive'
          END,
          initial_instructions,
          created_at, updated_at, completed_at
        FROM dev_sessions;

        -- Drop old table and rename new one
        DROP TABLE dev_sessions;
        ALTER TABLE dev_sessions_new RENAME TO dev_sessions;

        -- Recreate indexes
        CREATE INDEX idx_dev_sessions_project ON dev_sessions(project_id);
        CREATE INDEX idx_dev_sessions_plan_item ON dev_sessions(plan_item_id);
        CREATE INDEX idx_dev_sessions_status ON dev_sessions(project_id, status);
      `);
    },
  },
  {
    id: 1014,
    name: '014_drop_scratchpad_items',
    up: (db: BetterSqliteDatabase) => {
      // Remove scratchpad_items table (migrated to file-based notes in .kpm/notes/)
      // Check if table exists before dropping
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scratchpad_items'").all() as { name: string }[];
      if (tables.length > 0) {
        db.exec(`DROP TABLE scratchpad_items;`);
      }
    },
  },
  {
    id: 1015,
    name: '015_sync_queue_plan_item_index',
    up: (db: BetterSqliteDatabase) => {
      // Add missing index for sync_queue.plan_item_id
      // Used by getByPlanItem() which queries by plan_item_id
      db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_queue_plan_item ON sync_queue(plan_item_id);`);
    },
  },
  {
    id: 1016,
    name: '016_association_custom_field_values',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- Add custom_field_values to tracker associations
        -- JSON blob storing static values for Jira custom fields
        -- e.g., {"customfield_10697": "option-id-123", "customfield_10100": "some text"}
        -- ============================================
        ALTER TABLE kpm_tracker_associations ADD COLUMN custom_field_values TEXT;
      `);
    },
  },
  {
    id: 1017,
    name: '017_sync_queue_custom_field_overrides',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- Add custom_field_overrides to sync queue
        -- JSON blob storing per-item overrides for custom fields
        -- e.g., {"customfield_10697": "option-id-999"}
        -- ============================================
        ALTER TABLE sync_queue ADD COLUMN custom_field_overrides TEXT;
      `);
    },
  },
  {
    id: 1018,
    name: '018_documents',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- DOCUMENTS: Project documentation metadata
        -- Content stored as markdown files in project folder
        -- ============================================
        CREATE TABLE documents (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('architecture', 'dev_guide', 'custom')),
          title TEXT NOT NULL,
          file_path TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX idx_documents_project ON documents(project_id);
      `);
    },
  },
  {
    id: 1019,
    name: '019_chat_session_tracking',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- Add chat_session_id for tracking session boundaries
        -- Allows users to browse/resume from previous sessions
        -- ============================================
        ALTER TABLE chat_messages ADD COLUMN chat_session_id TEXT;

        -- Index for querying sessions by project
        CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_session
          ON chat_messages(session_type, session_id, chat_session_id);
      `);
    },
  },
  {
    id: 1020,
    name: '020_inbox_items',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- INBOX ITEMS: Quick capture with AI enhancement
        -- Replaces file-based Quick Notes system
        -- ============================================
        CREATE TABLE IF NOT EXISTS inbox_items (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

          -- Content
          raw_content TEXT NOT NULL,
          enhanced_content TEXT,

          -- AI Enhancement
          enhancement_status TEXT NOT NULL DEFAULT 'pending'
            CHECK(enhancement_status IN ('pending', 'enhancing', 'enhanced', 'failed', 'skipped')),
          enhancement_error TEXT,
          enhanced_at DATETIME,

          -- Categorization (AI-suggested)
          suggested_type TEXT CHECK(suggested_type IN ('task', 'note', 'question', 'idea', 'blocker')),

          -- Status
          status TEXT NOT NULL DEFAULT 'active'
            CHECK(status IN ('active', 'completed', 'archived')),

          -- Promotion tracking
          promoted_to_plan_item_id TEXT REFERENCES plan_items(id) ON DELETE SET NULL,
          expanded_to_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,

          -- Timestamps
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME
        );

        CREATE INDEX IF NOT EXISTS idx_inbox_items_project ON inbox_items(project_id);
        CREATE INDEX IF NOT EXISTS idx_inbox_items_project_status ON inbox_items(project_id, status);
      `);
    },
  },
  {
    id: 1022,
    name: '022_separate_chat_session_types',
    up: (db: BetterSqliteDatabase) => {
      // Separate chat sessions between Workspace and Plan views.
      // Existing 'main' sessions are migrated to 'workspace'.
      // SQLite requires table recreation to change CHECK constraints.
      db.exec(`
        -- ============================================
        -- Update chat_messages session_type constraint
        -- 'main' → 'workspace', add 'plan'
        -- ============================================
        CREATE TABLE chat_messages_new (
          id TEXT PRIMARY KEY,
          session_type TEXT NOT NULL CHECK (session_type IN ('workspace', 'plan', 'brainstorm')),
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          chat_session_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Migrate data: 'main' → 'workspace'
        INSERT INTO chat_messages_new (id, session_type, session_id, role, content, chat_session_id, created_at)
        SELECT id,
               CASE WHEN session_type = 'main' THEN 'workspace' ELSE session_type END,
               session_id, role, content, chat_session_id, created_at
        FROM chat_messages;

        DROP TABLE chat_messages;
        ALTER TABLE chat_messages_new RENAME TO chat_messages;

        -- Recreate indexes
        CREATE INDEX idx_chat_messages_session ON chat_messages(session_type, session_id);
        CREATE INDEX idx_chat_messages_chat_session ON chat_messages(session_type, session_id, chat_session_id);
      `);
    },
  },
  {
    id: 1023,
    name: '023_chat_sessions_table',
    up: (db: BetterSqliteDatabase) => {
      // Create chat_sessions table to store Claude SDK session ID per conversation.
      // This enables proper session resume when loading from chat history.
      // Previously, session_id was stored per-project which meant only one
      // conversation could be resumed at a time.
      //
      // ⚠️ BUG: This migration had a critical flaw - it dropped the projects table
      // without disabling foreign keys first, which triggered ON DELETE CASCADE
      // and deleted all plan_items. The migration has already run so we can't fix it,
      // but future migrations that recreate tables MUST use:
      //   PRAGMA foreign_keys = OFF;
      //   ... drop/rename operations ...
      //   PRAGMA foreign_keys = ON;
      db.exec(`
        -- ============================================
        -- Create chat_sessions table
        -- ============================================
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          session_type TEXT NOT NULL CHECK (session_type IN ('workspace', 'plan')),
          claude_session_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX idx_chat_sessions_project ON chat_sessions(project_id);
        CREATE INDEX idx_chat_sessions_project_type ON chat_sessions(project_id, session_type);

        -- ============================================
        -- Remove session_id from projects table
        -- SQLite requires table recreation to drop columns
        -- ============================================
        CREATE TABLE projects_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          folder_path TEXT NOT NULL,
          phase TEXT NOT NULL DEFAULT 'discovery',
          session_tokens INTEGER DEFAULT 0,
          session_input_tokens INTEGER DEFAULT 0,
          session_output_tokens INTEGER DEFAULT 0,
          storybook_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO projects_new (id, name, folder_path, phase, session_tokens, session_input_tokens, session_output_tokens, storybook_url, created_at, updated_at)
        SELECT id, name, folder_path, phase, session_tokens, session_input_tokens, session_output_tokens, storybook_url, created_at, updated_at
        FROM projects;

        DROP TABLE projects;
        ALTER TABLE projects_new RENAME TO projects;
      `);
    },
  },
  {
    id: 1024,
    name: '024_association_epic_key',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- Add epic_key to tracker associations
        -- Jira issue key to use as parent Epic when creating new issues
        -- e.g., 'PROJ-6224'
        -- ============================================
        ALTER TABLE kpm_tracker_associations ADD COLUMN epic_key TEXT;
      `);
    },
  },
  {
    id: 1025,
    name: '025_flatten_custom_field_values',
    up: (db: BetterSqliteDatabase) => {
      // Flatten custom_field_values from per-issue-type structure to project-wide.
      // Old format: { "10001": { fieldId: value }, "__default__": { fieldId: value } }
      // New format: { fieldId: value }
      // Strategy: merge all values, preferring __default__ then first type found
      const associations = db.prepare(`
        SELECT id, custom_field_values FROM kpm_tracker_associations
        WHERE custom_field_values IS NOT NULL
      `).all() as { id: string; custom_field_values: string }[];

      const updateStmt = db.prepare(`
        UPDATE kpm_tracker_associations SET custom_field_values = ? WHERE id = ?
      `);

      for (const assoc of associations) {
        try {
          const parsed = JSON.parse(assoc.custom_field_values);

          // Skip if already flat (no nested objects)
          const values = Object.values(parsed);
          if (values.length > 0 && typeof values[0] !== 'object') {
            continue; // Already flat format
          }

          // Merge all values into flat structure
          // Priority: __default__ values, then merge from other types
          const flattened: Record<string, string> = {};

          // First, collect values from all issue types (except __default__)
          for (const [key, typeValues] of Object.entries(parsed)) {
            if (key !== '__default__' && typeof typeValues === 'object' && typeValues !== null) {
              Object.assign(flattened, typeValues);
            }
          }

          // Then overlay __default__ values (they take priority)
          }

          // Update with flattened structure (or null if empty)
          const newValue = Object.keys(flattened).length > 0
            ? JSON.stringify(flattened)
            : null;
          updateStmt.run(newValue, assoc.id);
        } catch {
          // Skip invalid JSON
          console.warn(`[Migration 025] Skipping invalid JSON for association ${assoc.id}`);
        }
      }
    },
  },
  {
    id: 1026,
    name: '026_remove_brainstorm',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- Remove brainstorm data and tables
        -- ============================================
        DROP TABLE IF EXISTS brainstorm_sessions;
        DROP TABLE IF EXISTS custom_agents;

        -- ============================================
        -- Update chat_messages schema and clear history
        -- ============================================
        CREATE TABLE chat_messages_new (
          id TEXT PRIMARY KEY,
          session_type TEXT NOT NULL CHECK (session_type IN ('workspace')),
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          chat_session_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        DROP TABLE chat_messages;
        ALTER TABLE chat_messages_new RENAME TO chat_messages;

        CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_type, session_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_session ON chat_messages(session_type, session_id, chat_session_id);

        -- ============================================
        -- Update chat_sessions schema and clear history
        -- ============================================
        CREATE TABLE chat_sessions_new (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          session_type TEXT NOT NULL CHECK (session_type IN ('workspace')),
          claude_session_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        DROP TABLE chat_sessions;
        ALTER TABLE chat_sessions_new RENAME TO chat_sessions;

        CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON chat_sessions(project_id);
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_project_type ON chat_sessions(project_id, session_type);
      `);
    },
  },
  {
    id: 1027,
    name: '027_remove_chat_session_type',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- Remove session_type from chat tables and clear history
        -- ============================================
        DROP TABLE IF EXISTS chat_messages;
        DROP TABLE IF EXISTS chat_sessions;

        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          chat_session_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_session_chat_session ON chat_messages(session_id, chat_session_id);

        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          claude_session_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON chat_sessions(project_id);
      `);
    },
  },
  {
    id: 1028,
    name: '028_groups_and_remove_none_status',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- GROUPS: Visual containers for organizing plan items (Figma-style frames)
        -- Groups are purely visual - they don't affect hierarchy (parent_id)
        -- ============================================
        CREATE TABLE IF NOT EXISTS groups (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          color TEXT DEFAULT '#6366f1',
          position_x REAL DEFAULT 100,
          position_y REAL DEFAULT 100,
          width REAL DEFAULT 400,
          height REAL DEFAULT 300,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_groups_project ON groups(project_id);

        -- ============================================
        -- Add group_id to plan_items for visual grouping
        -- ============================================
        ALTER TABLE plan_items ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_plan_items_group ON plan_items(group_id);

        -- ============================================
        -- Delete items with status_category = 'none' (container items no longer needed)
        -- ============================================
        DELETE FROM plan_items WHERE status_category = 'none';

        -- ============================================
        -- Recreate plan_items with updated CHECK constraint (remove 'none')
        -- CRITICAL: Disable foreign keys during table recreation
        -- ============================================
        PRAGMA foreign_keys = OFF;

        CREATE TABLE plan_items_new (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          parent_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          label TEXT,
          item_order INTEGER NOT NULL,
          code_refs TEXT,
          status TEXT NOT NULL DEFAULT 'planned' CHECK(status = 'planned'),
          release_tag TEXT,
          position_x REAL,
          position_y REAL,
          association_id TEXT REFERENCES kpm_tracker_associations(id) ON DELETE SET NULL,
          external_key TEXT,
          external_id TEXT,
          external_type TEXT,
          external_issue_type TEXT,
          external_status TEXT,
          status_category TEXT CHECK(status_category IN ('not_started', 'in_progress', 'done', 'blocked', 'canceled')),
          external_url TEXT,
          external_parent_key TEXT,
          external_epic_key TEXT,
          sync_source TEXT DEFAULT 'local',
          last_synced_at DATETIME,
          completed_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          group_id TEXT REFERENCES groups(id) ON DELETE SET NULL
        );

        -- Copy all data (excluding 'none' status items which were already deleted)
        INSERT INTO plan_items_new (
          id, project_id, parent_id, title, description, label, item_order, code_refs,
          status, release_tag, position_x, position_y, association_id, external_key,
          external_id, external_type, external_issue_type, external_status, status_category,
          external_url, external_parent_key, external_epic_key, sync_source, last_synced_at,
          completed_at, created_at, updated_at, group_id
        )
        SELECT
          id, project_id, parent_id, title, description, label, item_order, code_refs,
          status, release_tag, position_x, position_y, association_id, external_key,
          external_id, external_type, external_issue_type, external_status, status_category,
          external_url, external_parent_key, external_epic_key, sync_source, last_synced_at,
          completed_at, created_at, updated_at, group_id
        FROM plan_items;

        DROP TABLE plan_items;
        ALTER TABLE plan_items_new RENAME TO plan_items;

        -- Recreate all indexes
        CREATE INDEX idx_plan_items_project ON plan_items(project_id);
        CREATE INDEX idx_plan_items_association ON plan_items(association_id);
        CREATE INDEX idx_plan_items_parent_project ON plan_items(project_id, parent_id);
        CREATE INDEX idx_plan_items_status_project ON plan_items(project_id, status);
        CREATE INDEX idx_plan_items_status_category_project ON plan_items(project_id, status_category);
        CREATE INDEX idx_plan_items_label_project ON plan_items(project_id, label);
        CREATE INDEX idx_plan_items_release_tag_project ON plan_items(project_id, release_tag);
        CREATE INDEX idx_plan_items_project_order ON plan_items(project_id, item_order);
        CREATE INDEX idx_plan_items_group ON plan_items(group_id);

        -- Recreate partial unique index for external key lookups
        CREATE UNIQUE INDEX idx_plan_items_external_key
        ON plan_items(project_id, external_type, external_key)
        WHERE external_key IS NOT NULL;

        PRAGMA foreign_keys = ON;
      `);
    },
  },
  {
    id: 1029,
    name: '029_fix_orphaned_children_from_none_containers',
    up: (db: BetterSqliteDatabase) => {
      // Migration 028 deleted containers (status_category='none') but left their children
      // with dangling parent_id references. This migration:
      // 1. Creates groups from any containers that existed (using orphan parent_ids)
      // 2. Assigns orphaned children to those groups
      // 3. Clears the dangling parent_id references

      db.exec(`
        -- ============================================
        -- Step 1: Find orphaned items (parent_id points to non-existent item)
        -- and create groups for each unique missing parent
        -- ============================================
        INSERT OR IGNORE INTO groups (id, project_id, name, color, position_x, position_y, width, height, created_at, updated_at)
        SELECT DISTINCT
          pi.parent_id as id,
          pi.project_id,
          'Recovered Group' as name,
          '#6366f1' as color,
          100 as position_x,
          100 as position_y,
          400 as width,
          300 as height,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        FROM plan_items pi
        LEFT JOIN plan_items parent ON pi.parent_id = parent.id
        WHERE pi.parent_id IS NOT NULL
          AND parent.id IS NULL;

        -- ============================================
        -- Step 2: Assign orphaned items to their recovered groups
        -- ============================================
        UPDATE plan_items
        SET group_id = parent_id
        WHERE parent_id IS NOT NULL
          AND parent_id IN (SELECT id FROM groups);

        -- ============================================
        -- Step 3: Clear dangling parent_id references
        -- ============================================
        UPDATE plan_items
        SET parent_id = NULL
        WHERE parent_id IS NOT NULL
          AND parent_id NOT IN (SELECT id FROM plan_items);
      `);
    },
  },
        -- Backfill: sessions without plan items get first 60 chars of instructions
  {
    id: 1075,
    name: '075_drop_inbox_and_project_sessions',
    up: (db: BetterSqliteDatabase) => {
      // global_search_index only exists when FTS5 is available (see migration 1040).
      // In test environments without FTS5 it's absent — guard the cleanup statement.
      const hasSearchIndex = db.prepare(`
        SELECT EXISTS (
          SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'global_search_index'
        ) AS exists_flag
      `).get() as { exists_flag: number };

      const hasBriefings = db.prepare(`
        SELECT EXISTS (
          SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_briefings'
        ) AS exists_flag
      `).get() as { exists_flag: number };

      db.exec(`
        PRAGMA foreign_keys = OFF;

        -- Drop inbox-related triggers and table
        DROP TRIGGER IF EXISTS trg_inbox_items_search_ai;
        DROP TRIGGER IF EXISTS trg_inbox_items_search_au;
        DROP TRIGGER IF EXISTS trg_inbox_items_search_ad;
        DROP INDEX IF EXISTS idx_inbox_items_project;
        DROP INDEX IF EXISTS idx_inbox_items_project_status;
        DROP INDEX IF EXISTS idx_inbox_items_project_status_created;
        DROP TABLE IF EXISTS inbox_items;

        -- Drop project sessions (Develop tab feature)
        DROP TRIGGER IF EXISTS trg_project_sessions_mode_check_insert;
        DROP TRIGGER IF EXISTS trg_project_sessions_mode_check_update;
        DROP INDEX IF EXISTS idx_project_sessions_project;
        DROP TABLE IF EXISTS project_sessions;
      `);

      if (hasSearchIndex.exists_flag === 1) {
        db.exec(`
          DROP TRIGGER IF EXISTS trg_global_search_index_ai;
          DROP TRIGGER IF EXISTS trg_global_search_index_ad;
          DROP TRIGGER IF EXISTS trg_global_search_index_au;
          DROP TRIGGER IF EXISTS trg_plan_items_search_ai;
          DROP TRIGGER IF EXISTS trg_plan_items_search_au;
          DROP TRIGGER IF EXISTS trg_plan_items_search_ad;
          DROP INDEX IF EXISTS idx_global_search_project_type_updated;
          DROP TABLE IF EXISTS global_search_fts;

          ALTER TABLE global_search_index RENAME TO global_search_index_old;

          CREATE TABLE global_search_index (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL CHECK (entity_type IN ('plan_item', 'document')),
            entity_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT,
            status_category TEXT,
            label TEXT,
            external_key TEXT,
            updated_at TEXT,
            UNIQUE(project_id, entity_type, entity_id)
          );

          CREATE INDEX idx_global_search_project_type_updated
            ON global_search_index(project_id, entity_type, updated_at DESC);

          INSERT INTO global_search_index (
            id,
            entity_type,
            entity_id,
            project_id,
            title,
            body,
            status_category,
            label,
            external_key,
            updated_at
          )
          SELECT
            id,
            entity_type,
            entity_id,
            project_id,
            title,
            body,
            status_category,
            label,
            external_key,
            updated_at
          FROM global_search_index_old
          WHERE entity_type IN ('plan_item', 'document');

          CREATE VIRTUAL TABLE global_search_fts USING fts5(
            title,
            body,
            content = 'global_search_index',
            content_rowid = 'id',
            tokenize = 'unicode61 remove_diacritics 2 tokenchars ''-_'''
          );

          CREATE TRIGGER trg_global_search_index_ai
          AFTER INSERT ON global_search_index
          BEGIN
            INSERT INTO global_search_fts(rowid, title, body)
            VALUES (new.id, new.title, COALESCE(new.body, ''));
          END;

          CREATE TRIGGER trg_global_search_index_ad
          AFTER DELETE ON global_search_index
          BEGIN
            INSERT INTO global_search_fts(global_search_fts, rowid, title, body)
            VALUES ('delete', old.id, old.title, COALESCE(old.body, ''));
          END;

          CREATE TRIGGER trg_global_search_index_au
          AFTER UPDATE ON global_search_index
          BEGIN
            INSERT INTO global_search_fts(global_search_fts, rowid, title, body)
            VALUES ('delete', old.id, old.title, COALESCE(old.body, ''));
            INSERT INTO global_search_fts(rowid, title, body)
            VALUES (new.id, new.title, COALESCE(new.body, ''));
          END;

          CREATE TRIGGER trg_plan_items_search_ai
          AFTER INSERT ON plan_items
          BEGIN
            DELETE FROM global_search_index
            WHERE project_id = new.project_id AND entity_type = 'plan_item' AND entity_id = new.id;
            INSERT INTO global_search_index (
              entity_type, entity_id, project_id, title, body, status_category, label, external_key, updated_at
            )
            VALUES (
              'plan_item',
              new.id,
              new.project_id,
              new.title,
              trim(COALESCE(new.description, '') || ' ' || COALESCE(new.external_key, '')),
              new.status_category,
              new.label,
              new.external_key,
              new.updated_at
            );
          END;

          CREATE TRIGGER trg_plan_items_search_au
          AFTER UPDATE ON plan_items
          BEGIN
            DELETE FROM global_search_index
            WHERE project_id = old.project_id AND entity_type = 'plan_item' AND entity_id = old.id;
            INSERT INTO global_search_index (
              entity_type, entity_id, project_id, title, body, status_category, label, external_key, updated_at
            )
            VALUES (
              'plan_item',
              new.id,
              new.project_id,
              new.title,
              trim(COALESCE(new.description, '') || ' ' || COALESCE(new.external_key, '')),
              new.status_category,
              new.label,
              new.external_key,
              new.updated_at
            );
          END;

          CREATE TRIGGER trg_plan_items_search_ad
          AFTER DELETE ON plan_items
          BEGIN
            DELETE FROM global_search_index
            WHERE project_id = old.project_id AND entity_type = 'plan_item' AND entity_id = old.id;
          END;

          INSERT INTO global_search_fts(global_search_fts) VALUES ('rebuild');
          DROP TABLE global_search_index_old;
        `);
      }

      if (hasBriefings.exists_flag === 1) {
        // Drop inbox_count column from project_briefings via table rebuild.
        db.exec(`
          CREATE TABLE project_briefings_new (
            project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
            summary TEXT NOT NULL,
            generated_at DATETIME NOT NULL,
            blocked_count INTEGER NOT NULL DEFAULT 0,
            stale_count INTEGER NOT NULL DEFAULT 0,
            ready_count INTEGER NOT NULL DEFAULT 0
          );
          INSERT INTO project_briefings_new (project_id, summary, generated_at, blocked_count, stale_count, ready_count)
          SELECT project_id, summary, generated_at, blocked_count, stale_count, ready_count FROM project_briefings;
          DROP TABLE project_briefings;
          ALTER TABLE project_briefings_new RENAME TO project_briefings;
        `);
      }

      db.exec(`PRAGMA foreign_keys = ON;`);
    },
  },
];

function ensureMigrationsTable(db: BetterSqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Check if a migration has been applied.
 */
function isMigrationApplied(db: BetterSqliteDatabase, name: string): boolean {
  const row = db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(name);
  return !!row;
}

/**
 * Record a migration as applied.
 */
function recordMigration(db: BetterSqliteDatabase, id: number, name: string): void {
  db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(id, name);
}

/**
 * Run all pending migrations.
 * Call this after setupSchema() to apply any new migrations.
 */
export function runMigrations(db: BetterSqliteDatabase): void {
  console.log('[Migrations] Checking for pending migrations...');

  // Ensure the migrations table exists before checking applied migrations
  ensureMigrationsTable(db);



    console.log(`[Migrations] Applying migration: ${migration.name}`);

    // Run migration in a transaction for safety
    const transaction = db.transaction(() => {
      migration.up(db);
      recordMigration(db, migration.id, migration.name);
    });

    transaction();
  }

}
