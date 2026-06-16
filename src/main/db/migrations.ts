import * as fs from 'fs';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';

/**
 * Database migrations for KPM.
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
        -- KPM-TRACKER ASSOCIATIONS: Sync filters
        -- Links KPM projects to specific tracker issues via filters (JQL for Jira, etc.)
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
          status_category TEXT CHECK(status_category IN ('not_started', 'in_progress', 'done', 'blocked', 'canceled', 'none')),  -- KPM's editable status ('none' = container item)
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
        -- TRACKER TYPE MAPPINGS: KPM label → Tracker issue type
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
        -- JSON blob mapping KPM status categories to Jira status names
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
          if (parsed.__default__ && typeof parsed.__default__ === 'object') {
            Object.assign(flattened, parsed.__default__);
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
  {
    id: 1030,
    name: '030_add_group_is_collapsed',
    up: (db: BetterSqliteDatabase) => {
      // Add is_collapsed column to groups table for collapse/expand functionality
      db.exec(`
        ALTER TABLE groups ADD COLUMN is_collapsed INTEGER NOT NULL DEFAULT 0;
      `);
    },
  },
  {
    id: 1031,
    name: '031_add_repo_environment_mode',
    up: (db: BetterSqliteDatabase) => {
      // Add environment_mode column to repos table for nix/direnv support
      // Values: 'auto' (detect from files), 'direnv', 'nix', 'none'
      db.exec(`
        ALTER TABLE repos ADD COLUMN environment_mode TEXT DEFAULT 'auto';
      `);
    },
  },
  {
    id: 1032,
    name: '032_confluence_page_links',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- CONFLUENCE PAGE LINKS: Document-to-page sync
        -- Links KPM documents to Confluence pages for bidirectional sync
        -- ============================================
        CREATE TABLE IF NOT EXISTS confluence_page_links (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          document_path TEXT NOT NULL,
          site_url TEXT NOT NULL,
          space_key TEXT NOT NULL,
          page_id TEXT NOT NULL,
          page_title TEXT,
          last_synced_at DATETIME,
          local_content_hash TEXT,
          remote_content_hash TEXT,
          remote_version INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, document_path),
          UNIQUE(page_id)
        );

        CREATE INDEX IF NOT EXISTS idx_confluence_links_project ON confluence_page_links(project_id);
      `);
    },
  },
  {
    id: 1033,
    name: '033_task_prompt_templates',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- TASK PROMPT TEMPLATES: Configurable Claude prompts for plan item creation
        -- Replaces ticket_templates - prompts guide Claude, not Jira export
        -- project_id = NULL means global template
        -- ============================================
        CREATE TABLE IF NOT EXISTS task_prompt_templates (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL DEFAULT 'default',
          prompt_content TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, name)
        );

        CREATE INDEX IF NOT EXISTS idx_task_prompt_templates_project ON task_prompt_templates(project_id);

        -- ============================================
        -- Drop ticket_templates table (no longer needed)
        -- ============================================
        DROP TABLE IF EXISTS ticket_templates;
      `);
    },
  },
  {
    id: 1034,
    name: '034_cleanup_unused_settings',
    up: (db: BetterSqliteDatabase) => {
      // Remove unused agent settings that were never implemented
      // - terminal_app: Was for external terminal launch (never used)
      // - dev_view_agent: Was for selecting agent CLI (never used)
      // - user_initials: Was for branch naming template variable (removed)
      db.exec(`
        DELETE FROM app_settings WHERE key IN ('terminal_app', 'dev_view_agent', 'user_initials');
      `);
    },
  },
  {
    id: 1035,
    name: '035_memory_system',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- MEMORIES: Extracted facts/learnings from conversations
        -- Stores project-specific knowledge, decisions, preferences
        -- ============================================
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          category TEXT NOT NULL CHECK(category IN (
            'preference', 'decision', 'context', 'learning', 'blocker', 'convention'
          )),
          importance INTEGER DEFAULT 5 CHECK(importance BETWEEN 1 AND 10),
          access_count INTEGER DEFAULT 0,
          last_accessed_at DATETIME,
          source_chat_session_id TEXT,
          source_message_ids TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
        CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(project_id, importance DESC);

        -- ============================================
        -- MEMORY EMBEDDINGS: Vector storage for semantic search
        -- 384-dim vectors stored as JSON array
        -- ============================================
        CREATE TABLE IF NOT EXISTS memory_embeddings (
          memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
          embedding TEXT NOT NULL,
          model TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2'
        );

        -- ============================================
        -- EXTRACTION LOG: Track processed chat sessions
        -- Prevents re-extracting from same messages
        -- ============================================
        CREATE TABLE IF NOT EXISTS memory_extraction_log (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          chat_session_id TEXT NOT NULL,
          last_processed_message_id TEXT,
          processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_extraction_log_session
          ON memory_extraction_log(project_id, chat_session_id);
      `);
    },
  },
  {
    id: 1036,
    name: '036_custom_prompts',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- CUSTOM PROMPTS: User-configurable prompts for Command+K
        -- Replaces hardcoded artifact generation commands
        -- Global prompts only (no project-specific scope)
        -- ============================================
        CREATE TABLE IF NOT EXISTS custom_prompts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          prompt_content TEXT NOT NULL,
          icon TEXT DEFAULT 'document' CHECK(icon IN ('chart', 'check', 'document', 'sparkles', 'clipboard')),
          keywords TEXT,
          is_builtin INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_custom_prompts_sort_order ON custom_prompts(sort_order);
      `);
    },
  },
  {
    id: 1037,
    name: '037_drop_memory_tables',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        DROP TABLE IF EXISTS memory_extraction_log;
        DROP TABLE IF EXISTS memory_embeddings;
        DROP TABLE IF EXISTS memories;
      `);
    },
  },
  {
    id: 1038,
    name: '038_chat_messages_provider',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- Add provider column to chat_messages
        -- Defaults to 'claude' for existing messages
        -- ============================================
        ALTER TABLE chat_messages ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude';
      `);
    },
  },
  {
    id: 1039,
    name: '039_project_sessions',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- PROJECT SESSIONS: Cross-repo Claude Code sessions
        -- Independent from plan items, rooted in project directory
        -- with --add-dir access to all connected repos
        -- ============================================
        CREATE TABLE IF NOT EXISTS project_sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending', 'active', 'inactive')),
          name TEXT,
          initial_instructions TEXT NOT NULL DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_project_sessions_project ON project_sessions(project_id);
      `);
    },
  },
  {
    id: 1040,
    name: '040_global_search_fts',
    up: (db: BetterSqliteDatabase) => {
      const compileOption = db.prepare(
        "SELECT sqlite_compileoption_used('ENABLE_FTS5') as enabled"
      ).get() as { enabled: number } | undefined;

      if (compileOption?.enabled !== 1) {
        console.warn('[Migrations] Skipping 040_global_search_fts (FTS5 not enabled in SQLite build)');
        return;
      }

      db.exec(`
        -- ============================================
        -- GLOBAL SEARCH INDEX (materialized metadata + searchable text)
        -- ============================================
        CREATE TABLE IF NOT EXISTS global_search_index (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL CHECK (entity_type IN ('plan_item', 'document', 'inbox_item')),
          entity_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT,
          status_category TEXT,
          label TEXT,
          external_key TEXT,
          chat_session_id TEXT,
          suggested_type TEXT,
          updated_at TEXT,
          UNIQUE(entity_type, entity_id)
        );

        CREATE INDEX IF NOT EXISTS idx_global_search_project_type_updated
          ON global_search_index(project_id, entity_type, updated_at DESC);

        -- ============================================
        -- FTS5 table (external content)
        -- ============================================
        CREATE VIRTUAL TABLE IF NOT EXISTS global_search_fts USING fts5(
          title,
          body,
          content = 'global_search_index',
          content_rowid = 'id',
          tokenize = 'unicode61 remove_diacritics 2 tokenchars ''-_'''
        );

        -- ============================================
        -- Keep FTS in sync with index table
        -- ============================================
        CREATE TRIGGER IF NOT EXISTS trg_global_search_index_ai
        AFTER INSERT ON global_search_index
        BEGIN
          INSERT INTO global_search_fts(rowid, title, body)
          VALUES (new.id, new.title, COALESCE(new.body, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS trg_global_search_index_ad
        AFTER DELETE ON global_search_index
        BEGIN
          INSERT INTO global_search_fts(global_search_fts, rowid, title, body)
          VALUES ('delete', old.id, old.title, COALESCE(old.body, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS trg_global_search_index_au
        AFTER UPDATE ON global_search_index
        BEGIN
          INSERT INTO global_search_fts(global_search_fts, rowid, title, body)
          VALUES ('delete', old.id, old.title, COALESCE(old.body, ''));
          INSERT INTO global_search_fts(rowid, title, body)
          VALUES (new.id, new.title, COALESCE(new.body, ''));
        END;

        -- ============================================
        -- Source table triggers: plan_items
        -- ============================================
        CREATE TRIGGER IF NOT EXISTS trg_plan_items_search_ai
        AFTER INSERT ON plan_items
        BEGIN
          DELETE FROM global_search_index WHERE entity_type = 'plan_item' AND entity_id = new.id;
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

        CREATE TRIGGER IF NOT EXISTS trg_plan_items_search_au
        AFTER UPDATE ON plan_items
        BEGIN
          DELETE FROM global_search_index WHERE entity_type = 'plan_item' AND entity_id = old.id;
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

        CREATE TRIGGER IF NOT EXISTS trg_plan_items_search_ad
        AFTER DELETE ON plan_items
        BEGIN
          DELETE FROM global_search_index WHERE entity_type = 'plan_item' AND entity_id = old.id;
        END;

        -- ============================================
        -- Source table triggers: inbox_items (active only)
        -- ============================================
        CREATE TRIGGER IF NOT EXISTS trg_inbox_items_search_ai
        AFTER INSERT ON inbox_items
        WHEN new.status = 'active'
        BEGIN
          DELETE FROM global_search_index WHERE entity_type = 'inbox_item' AND entity_id = new.id;
          INSERT INTO global_search_index (
            entity_type, entity_id, project_id, title, body, suggested_type, updated_at
          )
          VALUES (
            'inbox_item',
            new.id,
            new.project_id,
            substr(COALESCE(new.enhanced_content, new.raw_content), 1, 80),
            COALESCE(new.enhanced_content, new.raw_content),
            new.suggested_type,
            new.updated_at
          );
        END;

        CREATE TRIGGER IF NOT EXISTS trg_inbox_items_search_au
        AFTER UPDATE ON inbox_items
        BEGIN
          DELETE FROM global_search_index WHERE entity_type = 'inbox_item' AND entity_id = old.id;
          INSERT INTO global_search_index (
            entity_type, entity_id, project_id, title, body, suggested_type, updated_at
          )
          SELECT
            'inbox_item',
            new.id,
            new.project_id,
            substr(COALESCE(new.enhanced_content, new.raw_content), 1, 80),
            COALESCE(new.enhanced_content, new.raw_content),
            new.suggested_type,
            new.updated_at
          WHERE new.status = 'active';
        END;

        CREATE TRIGGER IF NOT EXISTS trg_inbox_items_search_ad
        AFTER DELETE ON inbox_items
        BEGIN
          DELETE FROM global_search_index WHERE entity_type = 'inbox_item' AND entity_id = old.id;
        END;
      `);

      db.exec(`
        -- Backfill search index from existing data
        INSERT OR IGNORE INTO global_search_index (
          entity_type, entity_id, project_id, title, body, status_category, label, external_key, updated_at
        )
        SELECT
          'plan_item',
          id,
          project_id,
          title,
          trim(COALESCE(description, '') || ' ' || COALESCE(external_key, '')),
          status_category,
          label,
          external_key,
          updated_at
        FROM plan_items;

        INSERT OR IGNORE INTO global_search_index (
          entity_type, entity_id, project_id, title, body, suggested_type, updated_at
        )
        SELECT
          'inbox_item',
          id,
          project_id,
          substr(COALESCE(enhanced_content, raw_content), 1, 80),
          COALESCE(enhanced_content, raw_content),
          suggested_type,
          updated_at
        FROM inbox_items
        WHERE status = 'active';
      `);
    },
  },
  {
    id: 1041,
    name: '041_remove_chat_from_global_search',
    up: (db: BetterSqliteDatabase) => {
      const hasSearchIndex = db.prepare(`
        SELECT EXISTS(
          SELECT 1 FROM sqlite_master
          WHERE type = 'table' AND name = 'global_search_index'
        ) as has_index
      `).get() as { has_index: number };

      if (hasSearchIndex.has_index !== 1) {
        return;
      }

      db.exec(`
        -- Stop indexing chat rows for global search
        DROP TRIGGER IF EXISTS trg_chat_messages_search_ai;
        DROP TRIGGER IF EXISTS trg_chat_messages_search_au;
        DROP TRIGGER IF EXISTS trg_chat_messages_search_ad;

        -- Remove any previously indexed chat rows
        DELETE FROM global_search_index
        WHERE entity_type = 'chat_message';
      `);
    },
  },
  {
    id: 1042,
    name: '042_remove_documents_table_global_search_overlap',
    up: (db: BetterSqliteDatabase) => {
      const hasSearchIndex = db.prepare(`
        SELECT EXISTS(
          SELECT 1 FROM sqlite_master
          WHERE type = 'table' AND name = 'global_search_index'
        ) as has_index
      `).get() as { has_index: number };

      if (hasSearchIndex.has_index !== 1) {
        return;
      }

      db.exec(`
        -- Filesystem docs are indexed by SearchService; avoid duplicate title-only rows from documents table.
        DROP TRIGGER IF EXISTS trg_documents_search_ai;
        DROP TRIGGER IF EXISTS trg_documents_search_au;
        DROP TRIGGER IF EXISTS trg_documents_search_ad;

        DELETE FROM global_search_index
        WHERE entity_type = 'document'
          AND (body IS NULL OR length(trim(body)) = 0);
      `);
    },
  },
  {
    id: 1043,
    name: '043_update_default_group_width',
    up: (db: BetterSqliteDatabase) => {
      // Update default group width from 400 to 552 (2 columns of 260px cards + 16px gap + 32px padding).
      // Only updates groups that still have the old default width; auto-layout will recalculate on next run.
      db.exec(`
        UPDATE groups SET width = 552 WHERE width = 400;
      `);
    },
  },
  {
    id: 1044,
    name: '044_chat_messages_client_message_id',
    up: (db: BetterSqliteDatabase) => {
      const columns = db.prepare('PRAGMA table_info(chat_messages)').all() as { name: string }[];
      const hasClientMessageId = columns.some((col) => col.name === 'client_message_id');

      if (!hasClientMessageId) {
        db.exec(`
          ALTER TABLE chat_messages ADD COLUMN client_message_id TEXT;
        `);
      }

      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_chat_session_client_message
          ON chat_messages(chat_session_id, client_message_id)
          WHERE client_message_id IS NOT NULL AND chat_session_id IS NOT NULL;
      `);
    },
  },
  {
    id: 1045,
    name: '045_agent_team_prompts_and_session_modes',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_prompts (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          agent_role TEXT NOT NULL CHECK(agent_role IN ('design_reviewer', 'test_reviewer', 'readability_reviewer')),
          name TEXT NOT NULL DEFAULT 'default',
          prompt_content TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, agent_role, name)
        );

        CREATE INDEX IF NOT EXISTS idx_agent_prompts_project ON agent_prompts(project_id);

        -- SQLite treats NULL values as distinct for UNIQUE constraints, so add an explicit global unique index.
        CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_prompts_global_unique
          ON agent_prompts(agent_role, name)
          WHERE project_id IS NULL;

        -- Ensure at most one default per role/scope.
        CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_prompts_default_project_role
          ON agent_prompts(project_id, agent_role)
          WHERE is_default = 1 AND project_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_prompts_default_global_role
          ON agent_prompts(agent_role)
          WHERE is_default = 1 AND project_id IS NULL;
      `);

      const devColumns = db.prepare('PRAGMA table_info(dev_sessions)').all() as { name: string }[];
      if (!devColumns.some((c) => c.name === 'requested_mode')) {
        db.exec(`ALTER TABLE dev_sessions ADD COLUMN requested_mode TEXT;`);
      }
      if (!devColumns.some((c) => c.name === 'effective_mode')) {
        db.exec(`ALTER TABLE dev_sessions ADD COLUMN effective_mode TEXT;`);
      }

      const projectColumns = db.prepare('PRAGMA table_info(project_sessions)').all() as { name: string }[];
      if (!projectColumns.some((c) => c.name === 'requested_mode')) {
        db.exec(`ALTER TABLE project_sessions ADD COLUMN requested_mode TEXT;`);
      }
      if (!projectColumns.some((c) => c.name === 'effective_mode')) {
        db.exec(`ALTER TABLE project_sessions ADD COLUMN effective_mode TEXT;`);
      }

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_dev_sessions_mode_check_insert
        BEFORE INSERT ON dev_sessions
        WHEN (
          (NEW.requested_mode IS NOT NULL AND NEW.requested_mode NOT IN ('solo', 'reviewed', 'thorough'))
          OR (NEW.effective_mode IS NOT NULL AND NEW.effective_mode NOT IN ('solo', 'reviewed', 'thorough'))
        )
        BEGIN
          SELECT RAISE(ABORT, 'Invalid dev session implementation mode');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_dev_sessions_mode_check_update
        BEFORE UPDATE ON dev_sessions
        WHEN (
          (NEW.requested_mode IS NOT NULL AND NEW.requested_mode NOT IN ('solo', 'reviewed', 'thorough'))
          OR (NEW.effective_mode IS NOT NULL AND NEW.effective_mode NOT IN ('solo', 'reviewed', 'thorough'))
        )
        BEGIN
          SELECT RAISE(ABORT, 'Invalid dev session implementation mode');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_project_sessions_mode_check_insert
        BEFORE INSERT ON project_sessions
        WHEN (
          (NEW.requested_mode IS NOT NULL AND NEW.requested_mode NOT IN ('solo', 'reviewed', 'thorough'))
          OR (NEW.effective_mode IS NOT NULL AND NEW.effective_mode NOT IN ('solo', 'reviewed', 'thorough'))
        )
        BEGIN
          SELECT RAISE(ABORT, 'Invalid project session implementation mode');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_project_sessions_mode_check_update
        BEFORE UPDATE ON project_sessions
        WHEN (
          (NEW.requested_mode IS NOT NULL AND NEW.requested_mode NOT IN ('solo', 'reviewed', 'thorough'))
          OR (NEW.effective_mode IS NOT NULL AND NEW.effective_mode NOT IN ('solo', 'reviewed', 'thorough'))
        )
        BEGIN
          SELECT RAISE(ABORT, 'Invalid project session implementation mode');
        END;
      `);
    },
  },
  {
    id: 1046,
    name: '046_remove_reviewed_implementation_mode',
    up: (db: BetterSqliteDatabase) => {
      // Migrate existing 'reviewed' sessions to 'thorough'
      db.exec(`
        UPDATE dev_sessions SET requested_mode = 'thorough' WHERE requested_mode = 'reviewed';
        UPDATE dev_sessions SET effective_mode = 'thorough' WHERE effective_mode = 'reviewed';
        UPDATE project_sessions SET requested_mode = 'thorough' WHERE requested_mode = 'reviewed';
        UPDATE project_sessions SET effective_mode = 'thorough' WHERE effective_mode = 'reviewed';
      `);

      // Recreate triggers without 'reviewed'
      db.exec(`
        DROP TRIGGER IF EXISTS trg_dev_sessions_mode_check_insert;
        DROP TRIGGER IF EXISTS trg_dev_sessions_mode_check_update;
        DROP TRIGGER IF EXISTS trg_project_sessions_mode_check_insert;
        DROP TRIGGER IF EXISTS trg_project_sessions_mode_check_update;

        CREATE TRIGGER trg_dev_sessions_mode_check_insert
        BEFORE INSERT ON dev_sessions
        WHEN (
          (NEW.requested_mode IS NOT NULL AND NEW.requested_mode NOT IN ('solo', 'thorough'))
          OR (NEW.effective_mode IS NOT NULL AND NEW.effective_mode NOT IN ('solo', 'thorough'))
        )
        BEGIN
          SELECT RAISE(ABORT, 'Invalid dev session implementation mode');
        END;

        CREATE TRIGGER trg_dev_sessions_mode_check_update
        BEFORE UPDATE ON dev_sessions
        WHEN (
          (NEW.requested_mode IS NOT NULL AND NEW.requested_mode NOT IN ('solo', 'thorough'))
          OR (NEW.effective_mode IS NOT NULL AND NEW.effective_mode NOT IN ('solo', 'thorough'))
        )
        BEGIN
          SELECT RAISE(ABORT, 'Invalid dev session implementation mode');
        END;

        CREATE TRIGGER trg_project_sessions_mode_check_insert
        BEFORE INSERT ON project_sessions
        WHEN (
          (NEW.requested_mode IS NOT NULL AND NEW.requested_mode NOT IN ('solo', 'thorough'))
          OR (NEW.effective_mode IS NOT NULL AND NEW.effective_mode NOT IN ('solo', 'thorough'))
        )
        BEGIN
          SELECT RAISE(ABORT, 'Invalid project session implementation mode');
        END;

        CREATE TRIGGER trg_project_sessions_mode_check_update
        BEFORE UPDATE ON project_sessions
        WHEN (
          (NEW.requested_mode IS NOT NULL AND NEW.requested_mode NOT IN ('solo', 'thorough'))
          OR (NEW.effective_mode IS NOT NULL AND NEW.effective_mode NOT IN ('solo', 'thorough'))
        )
        BEGIN
          SELECT RAISE(ABORT, 'Invalid project session implementation mode');
        END;
      `);
    },
  },
  {
    id: 1047,
    name: '047_add_security_and_synthesizer_agent_roles',
    up: (db: BetterSqliteDatabase) => {
      // Add security_reviewer and review_synthesizer to agent_prompts CHECK constraint.
      // SQLite requires table recreation to change CHECK constraints.
      db.exec(`
        PRAGMA foreign_keys = OFF;

        CREATE TABLE agent_prompts_new (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          agent_role TEXT NOT NULL CHECK(agent_role IN ('design_reviewer', 'test_reviewer', 'readability_reviewer', 'security_reviewer', 'review_synthesizer')),
          name TEXT NOT NULL DEFAULT 'default',
          prompt_content TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, agent_role, name)
        );

        INSERT INTO agent_prompts_new (id, project_id, agent_role, name, prompt_content, is_default, created_at, updated_at)
        SELECT id, project_id, agent_role, name, prompt_content, is_default, created_at, updated_at
        FROM agent_prompts;

        DROP TABLE agent_prompts;
        ALTER TABLE agent_prompts_new RENAME TO agent_prompts;

        -- Recreate indexes
        CREATE INDEX idx_agent_prompts_project ON agent_prompts(project_id);

        CREATE UNIQUE INDEX idx_agent_prompts_global_unique
          ON agent_prompts(agent_role, name)
          WHERE project_id IS NULL;

        CREATE UNIQUE INDEX idx_agent_prompts_default_project_role
          ON agent_prompts(project_id, agent_role)
          WHERE is_default = 1 AND project_id IS NOT NULL;

        CREATE UNIQUE INDEX idx_agent_prompts_default_global_role
          ON agent_prompts(agent_role)
          WHERE is_default = 1 AND project_id IS NULL;

        PRAGMA foreign_keys = ON;
      `);
    },
  },
  {
    id: 1048,
    name: '048_remove_auto_created_agent_prompt_defaults',
    up: (db: BetterSqliteDatabase) => {
      // Delete global "Default" templates that were auto-created by ensureDefaultsExist().
      // These are identifiable by:
      //   - project_id IS NULL (global scope)
      //   - name = 'Default'
      // User-created templates typically have custom names, so they won't be affected.
      db.exec(`
        DELETE FROM agent_prompts
        WHERE project_id IS NULL
          AND name = 'Default';
      `);
    },
  },
  {
    id: 1049,
    name: '049_remove_agent_instructions_from_projects',
    up: (db: BetterSqliteDatabase) => {
      // Remove agent_instructions column - feature deprecated in favor of CLAUDE.md files
      // Check if column exists first (migration 022 may have already removed it)
      const tableInfo = db.prepare('PRAGMA table_info(projects)').all() as { name: string }[];
      const hasAgentInstructions = tableInfo.some((col) => col.name === 'agent_instructions');

      if (!hasAgentInstructions) {
        console.log('[Migration 049] Column agent_instructions does not exist, skipping.');
        return;
      }

      db.exec(`
        PRAGMA foreign_keys = OFF;

        CREATE TABLE projects_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          folder_path TEXT NOT NULL,
          phase TEXT NOT NULL DEFAULT 'discovery' CHECK(phase IN ('discovery', 'high_level', 'detailed', 'ready')),
          session_tokens INTEGER NOT NULL DEFAULT 0,
          session_input_tokens INTEGER NOT NULL DEFAULT 0,
          session_output_tokens INTEGER NOT NULL DEFAULT 0,
          storybook_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO projects_new SELECT
          id, name, folder_path, phase,
          session_tokens, session_input_tokens, session_output_tokens,
          storybook_url, created_at, updated_at
        FROM projects;

        DROP TABLE projects;
        ALTER TABLE projects_new RENAME TO projects;

        PRAGMA foreign_keys = ON;
      `);
    },
  },
  {
    id: 1050,
    name: '050_query_performance_indexes',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- Standalone parent_id index for plan_items
        -- Fixes: FULL TABLE SCAN in recursive CTE base query,
        -- AUTOMATIC INDEX creation in recursive step,
        -- and covering index SCAN in getChildCount
        CREATE INDEX IF NOT EXISTS idx_plan_items_parent
          ON plan_items(parent_id);

        -- Composite index covering childrenByParent + siblings queries
        -- Satisfies WHERE project_id=? AND parent_id=? ORDER BY item_order
        CREATE INDEX IF NOT EXISTS idx_plan_items_parent_project_order
          ON plan_items(project_id, parent_id, item_order);

        -- Composite index eliminating TEMP B-TREE sort on chat message loading
        -- Satisfies WHERE session_id=? ORDER BY created_at
        CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
          ON chat_messages(session_id, created_at);

        -- Composite index eliminating TEMP B-TREE sort on inbox item loading
        -- Satisfies WHERE project_id=? AND status=? ORDER BY created_at DESC
        CREATE INDEX IF NOT EXISTS idx_inbox_items_project_status_created
          ON inbox_items(project_id, status, created_at DESC);
      `);
    },
  },
  {
    id: 1051,
    name: '051_project_briefings',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_briefings (
          project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
          summary TEXT NOT NULL,
          generated_at TEXT NOT NULL,
          blocked_count INTEGER NOT NULL DEFAULT 0,
          stale_count INTEGER NOT NULL DEFAULT 0,
          inbox_count INTEGER NOT NULL DEFAULT 0,
          ready_count INTEGER NOT NULL DEFAULT 0
        );
      `);
    },
  },
  {
    id: 1052,
    name: '052_tool_permissions',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tool_permissions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          cache_key TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          label TEXT NOT NULL,
          granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, cache_key)
        );
        CREATE INDEX IF NOT EXISTS idx_tool_permissions_project
          ON tool_permissions(project_id);
      `);
    },
  },
  {
    id: 1053,
    name: '053_vibe_kanban_executions',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS vibe_kanban_executions (
          id TEXT PRIMARY KEY,
          plan_item_id TEXT NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          executor TEXT NOT NULL DEFAULT 'CLAUDE_CODE',
          vk_issue_id TEXT,
          vk_workspace_id TEXT,
          vk_execution_id TEXT,
          vk_repo_id TEXT,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending','running','interrupted','completed','failed','killed','canceled')),
          final_message TEXT,
          error TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_vk_executions_plan_item
          ON vibe_kanban_executions(plan_item_id);
        CREATE INDEX IF NOT EXISTS idx_vk_executions_project
          ON vibe_kanban_executions(project_id);
        CREATE INDEX IF NOT EXISTS idx_vk_executions_status
          ON vibe_kanban_executions(status)
          WHERE status IN ('pending', 'running', 'interrupted');
      `);
    },
  },
  {
    id: 1054,
    name: '054_remove_vibe_kanban',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        DROP TABLE IF EXISTS vibe_kanban_executions;
        DELETE FROM app_settings
        WHERE key IN (
          'vibe_kanban_enabled',
          'vibe_kanban_repo_mappings',
          'vibe_kanban_project_mappings'
        );
      `);
    },
  },
  {
    id: 1055,
    name: '055_add_pr_columns_to_dev_sessions',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- Add PR tracking columns to dev_sessions
        -- Stores the associated PR created from the session branch
        -- ============================================
        ALTER TABLE dev_sessions ADD COLUMN pr_number INTEGER;
        ALTER TABLE dev_sessions ADD COLUMN pr_url TEXT;
        ALTER TABLE dev_sessions ADD COLUMN pr_state TEXT;
        ALTER TABLE dev_sessions ADD COLUMN review_state TEXT;
      `);
    },
  },
  {
    id: 1056,
    name: '056_add_in_review_status_category',
    up: (db: BetterSqliteDatabase) => {
      // Add 'in_review' to the status_category CHECK constraint on plan_items.
      // SQLite doesn't support ALTER TABLE ... DROP/ADD CONSTRAINT, so table
      // recreation is normally required. However, DROP TABLE inside a transaction
      // with foreign_keys=ON triggers ON DELETE CASCADE, destroying related data.
      //
      // Safe approach: drop the CHECK constraint entirely by recreating the column.
      // SQLite allows us to rename the old column, add a new one without the CHECK,
      // copy data, and drop the old column — all without touching the table identity
      // or triggering cascade deletes.
      // 1. Capture and drop triggers/indexes that reference status_category.
      //    RENAME COLUMN updates trigger SQL to use the new name, so DROP COLUMN
      //    then fails because the trigger references the renamed (now-dropped) column.
      const triggers = (db.prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'plan_items'"
      ).all() as { name: string; sql: string }[]);

      for (const t of triggers) {
        db.exec(`DROP TRIGGER IF EXISTS ${t.name};`);
      }

      db.exec(`DROP INDEX IF EXISTS idx_plan_items_status_category_project;`);

      // 2. Rename old column, add new one with updated CHECK, copy data, drop old
      db.exec(`ALTER TABLE plan_items RENAME COLUMN status_category TO status_category_old;`);
      db.exec(`
        ALTER TABLE plan_items ADD COLUMN status_category TEXT
          CHECK(status_category IN ('not_started', 'in_progress', 'in_review', 'done', 'blocked', 'canceled'));
      `);
      db.exec(`UPDATE plan_items SET status_category = status_category_old;`);
      db.exec(`ALTER TABLE plan_items DROP COLUMN status_category_old;`);

      // 3. Recreate index
      db.exec(`CREATE INDEX idx_plan_items_status_category_project ON plan_items(project_id, status_category);`);

      // 4. Recreate triggers using the ORIGINAL sql (which references status_category, not the renamed column)
      for (const t of triggers) {
        db.exec(t.sql);
      }

      // 5. Also update sync_queue's target_status_category CHECK if it exists
      const syncQueueInfo = db.prepare("PRAGMA table_info(sync_queue)").all() as { name: string }[];
      if (syncQueueInfo.some((c) => c.name === 'target_status_category')) {
        db.exec(`ALTER TABLE sync_queue RENAME COLUMN target_status_category TO target_status_category_old;`);
        db.exec(`
          ALTER TABLE sync_queue ADD COLUMN target_status_category TEXT
            CHECK(target_status_category IN ('not_started', 'in_progress', 'in_review', 'done', 'blocked', 'canceled'));
        `);
        db.exec(`UPDATE sync_queue SET target_status_category = target_status_category_old;`);
        db.exec(`ALTER TABLE sync_queue DROP COLUMN target_status_category_old;`);
      }
    },
  },
  {
    id: 1057,
    name: '057_add_plan_review_and_behavior_agent_roles',
    up: (db: BetterSqliteDatabase) => {
      // Add plan review roles and behavior_reviewer to agent_prompts CHECK constraint.
      // SQLite requires table recreation to change CHECK constraints.
      db.exec(`
        PRAGMA foreign_keys = OFF;

        CREATE TABLE agent_prompts_new (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          agent_role TEXT NOT NULL CHECK(agent_role IN (
            'codebase_fit_reviewer', 'premortem_reviewer', 'scope_reviewer', 'completeness_reviewer', 'plan_synthesizer',
            'behavior_reviewer', 'design_reviewer', 'test_reviewer', 'readability_reviewer', 'security_reviewer', 'review_synthesizer'
          )),
          name TEXT NOT NULL DEFAULT 'default',
          prompt_content TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, agent_role, name)
        );

        INSERT INTO agent_prompts_new (id, project_id, agent_role, name, prompt_content, is_default, created_at, updated_at)
        SELECT id, project_id, agent_role, name, prompt_content, is_default, created_at, updated_at
        FROM agent_prompts;

        DROP TABLE agent_prompts;
        ALTER TABLE agent_prompts_new RENAME TO agent_prompts;

        CREATE INDEX idx_agent_prompts_project ON agent_prompts(project_id);

        CREATE UNIQUE INDEX idx_agent_prompts_global_unique
          ON agent_prompts(agent_role, name)
          WHERE project_id IS NULL;

        CREATE UNIQUE INDEX idx_agent_prompts_default_project_role
          ON agent_prompts(project_id, agent_role)
          WHERE is_default = 1 AND project_id IS NOT NULL;

        CREATE UNIQUE INDEX idx_agent_prompts_default_global_role
          ON agent_prompts(agent_role)
          WHERE is_default = 1 AND project_id IS NULL;

        PRAGMA foreign_keys = ON;
      `);
    },
  },

  // Make plan_item_id nullable to support "free" dev sessions (no plan item)
  {
    id: 1058,
    name: '058_make_dev_session_plan_item_nullable',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        PRAGMA foreign_keys = OFF;

        CREATE TABLE dev_sessions_new (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          plan_item_id TEXT REFERENCES plan_items(id) ON DELETE CASCADE,
          repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          worktree_path TEXT NOT NULL,
          branch_name TEXT NOT NULL,
          base_branch TEXT NOT NULL DEFAULT 'main',
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'inactive')),
          initial_instructions TEXT NOT NULL DEFAULT '',
          requested_mode TEXT CHECK(requested_mode IN ('solo', 'thorough')),
          effective_mode TEXT CHECK(effective_mode IN ('solo', 'thorough')),
          pr_number INTEGER,
          pr_url TEXT,
          pr_state TEXT,
          review_state TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME
        );

        INSERT INTO dev_sessions_new (
          id, project_id, plan_item_id, repo_id,
          worktree_path, branch_name, base_branch,
          status, initial_instructions,
          requested_mode, effective_mode,
          pr_number, pr_url, pr_state, review_state,
          created_at, updated_at, completed_at
        )
        SELECT
          id, project_id, plan_item_id, repo_id,
          worktree_path, branch_name, base_branch,
          status, initial_instructions,
          requested_mode, effective_mode,
          pr_number, pr_url, pr_state, review_state,
          created_at, updated_at, completed_at
        FROM dev_sessions;

        DROP TABLE dev_sessions;
        ALTER TABLE dev_sessions_new RENAME TO dev_sessions;

        CREATE INDEX idx_dev_sessions_project ON dev_sessions(project_id);
        CREATE INDEX idx_dev_sessions_plan_item ON dev_sessions(plan_item_id);
        CREATE INDEX idx_dev_sessions_status ON dev_sessions(status);

        PRAGMA foreign_keys = ON;
      `);
    },
  },
  {
    id: 1059,
    name: '059_add_dev_session_name',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        ALTER TABLE dev_sessions ADD COLUMN name TEXT;

        -- Backfill: plan-item sessions get the plan item title
        UPDATE dev_sessions
        SET name = (SELECT pi.title FROM plan_items pi WHERE pi.id = dev_sessions.plan_item_id)
        WHERE plan_item_id IS NOT NULL;

        -- Backfill: sessions without plan items get first 60 chars of instructions
        UPDATE dev_sessions
        SET name = SUBSTR(initial_instructions, 1, 60)
        WHERE plan_item_id IS NULL AND name IS NULL;
      `);
    },
  },
  {
    id: 1060,
    name: '060_add_review_workflow_tables',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS review_ownership (
          repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          pr_number INTEGER NOT NULL,
          session_id TEXT NOT NULL REFERENCES dev_sessions(id) ON DELETE CASCADE,
          mode TEXT NOT NULL CHECK(mode IN ('manual', 'auto_resume', 'auto_post_bots', 'auto_post_all')),
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (repo_id, pr_number)
        );

        CREATE TABLE IF NOT EXISTS review_tasks (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          session_id TEXT NOT NULL REFERENCES dev_sessions(id) ON DELETE CASCADE,
          pr_number INTEGER NOT NULL,
          thread_id TEXT NOT NULL,
          thread_url TEXT NOT NULL,
          path TEXT,
          line INTEGER,
          source TEXT NOT NULL CHECK(source IN ('human', 'bot', 'mixed')),
          status TEXT NOT NULL CHECK(status IN (
            'new', 'queued', 'assigned', 'in_progress', 'awaiting_user_review',
            'ready_to_post', 'posted', 'resolved', 'stale', 'ignored', 'failed'
          )),
          priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high')),
          title TEXT NOT NULL,
          latest_comment_preview TEXT,
          last_seen_comment_id TEXT,
          last_seen_updated_at DATETIME NOT NULL,
          last_agent_run_at DATETIME,
          last_posted_reply_id TEXT,
          error TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME,
          UNIQUE (repo_id, pr_number, thread_id)
        );

        CREATE INDEX IF NOT EXISTS idx_review_tasks_session_status
          ON review_tasks(session_id, status);
        CREATE INDEX IF NOT EXISTS idx_review_tasks_repo_pr_status
          ON review_tasks(repo_id, pr_number, status);
        CREATE INDEX IF NOT EXISTS idx_review_tasks_updated_at
          ON review_tasks(updated_at);

        CREATE TABLE IF NOT EXISTS review_sync_state (
          repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          pr_number INTEGER NOT NULL,
          session_id TEXT REFERENCES dev_sessions(id) ON DELETE SET NULL,
          last_fetched_at DATETIME,
          last_successful_fetched_at DATETIME,
          last_head_oid TEXT,
          last_review_decision TEXT CHECK(last_review_decision IN ('APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED')),
          last_error TEXT,
          PRIMARY KEY (repo_id, pr_number)
        );
      `);
    },
  },
  {
    id: 1061,
    name: '061_remove_review_ownership_mode',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        PRAGMA foreign_keys = OFF;

        CREATE TABLE review_ownership_new (
          repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          pr_number INTEGER NOT NULL,
          session_id TEXT NOT NULL REFERENCES dev_sessions(id) ON DELETE CASCADE,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (repo_id, pr_number)
        );

        INSERT INTO review_ownership_new (repo_id, pr_number, session_id, created_at, updated_at)
        SELECT repo_id, pr_number, session_id, created_at, updated_at
        FROM review_ownership;

        DROP TABLE review_ownership;
        ALTER TABLE review_ownership_new RENAME TO review_ownership;

        PRAGMA foreign_keys = ON;
      `);
    },
  },
  {
    id: 1062,
    name: '062_review_task_status_model_v2',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        PRAGMA foreign_keys = OFF;

        CREATE TABLE review_tasks_new (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          session_id TEXT NOT NULL REFERENCES dev_sessions(id) ON DELETE CASCADE,
          pr_number INTEGER NOT NULL,
          thread_id TEXT NOT NULL,
          thread_url TEXT NOT NULL,
          path TEXT,
          line INTEGER,
          source TEXT NOT NULL CHECK(source IN ('human', 'bot', 'mixed')),
          status TEXT NOT NULL CHECK(status IN (
            'needs_review', 'assessed', 'in_progress', 'ready_to_post', 'done'
          )),
          internal_state TEXT CHECK(internal_state IN (
            'assessment_running', 'implementation_queued', 'post_impl_running',
            'stale', 'failed', 'ignored'
          )),
          disposition TEXT CHECK(disposition IN ('implement', 'push_back', 'needs_user_input')),
          rationale TEXT,
          draft_reply TEXT,
          priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high')),
          title TEXT NOT NULL,
          latest_comment_preview TEXT,
          last_seen_comment_id TEXT,
          last_seen_updated_at DATETIME NOT NULL,
          last_agent_run_at DATETIME,
          last_posted_reply_id TEXT,
          error TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME,
          UNIQUE (repo_id, pr_number, thread_id)
        );

        INSERT INTO review_tasks_new (
          id, project_id, repo_id, session_id, pr_number, thread_id, thread_url,
          path, line, source, status, internal_state, disposition, rationale, draft_reply,
          priority, title, latest_comment_preview, last_seen_comment_id,
          last_seen_updated_at, last_agent_run_at, last_posted_reply_id,
          error, created_at, updated_at, completed_at
        )
        SELECT
          id, project_id, repo_id, session_id, pr_number, thread_id, thread_url,
          path, line, source,
          CASE status
            WHEN 'new' THEN 'needs_review'
            WHEN 'queued' THEN 'in_progress'
            WHEN 'assigned' THEN 'in_progress'
            WHEN 'in_progress' THEN 'in_progress'
            WHEN 'awaiting_user_review' THEN 'assessed'
            WHEN 'ready_to_post' THEN 'ready_to_post'
            WHEN 'posted' THEN 'done'
            WHEN 'resolved' THEN 'done'
            WHEN 'stale' THEN 'needs_review'
            WHEN 'ignored' THEN 'done'
            WHEN 'failed' THEN 'needs_review'
            ELSE 'needs_review'
          END,
          CASE status
            WHEN 'stale' THEN 'stale'
            WHEN 'ignored' THEN 'ignored'
            WHEN 'failed' THEN 'failed'
            ELSE NULL
          END,
          NULL, NULL, NULL,
          priority, title, latest_comment_preview, last_seen_comment_id,
          last_seen_updated_at, last_agent_run_at, last_posted_reply_id,
          error, created_at, updated_at, completed_at
        FROM review_tasks;

        DROP TABLE review_tasks;
        ALTER TABLE review_tasks_new RENAME TO review_tasks;

        CREATE INDEX IF NOT EXISTS idx_review_tasks_session_status
          ON review_tasks(session_id, status);
        CREATE INDEX IF NOT EXISTS idx_review_tasks_repo_pr_status
          ON review_tasks(repo_id, pr_number, status);
        CREATE INDEX IF NOT EXISTS idx_review_tasks_updated_at
          ON review_tasks(updated_at);

        PRAGMA foreign_keys = ON;
      `);
    },
  },
  {
    id: 1063,
    name: '063_slack_channel_triage',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS slack_channel_links (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          channel_id TEXT NOT NULL,
          channel_name TEXT NOT NULL,
          last_checked_ts TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (project_id, channel_id)
        );

        CREATE INDEX IF NOT EXISTS idx_slack_channel_links_project
          ON slack_channel_links(project_id);

        CREATE TABLE IF NOT EXISTS slack_triage_items (
          id TEXT PRIMARY KEY,
          channel_link_id TEXT NOT NULL REFERENCES slack_channel_links(id) ON DELETE CASCADE,
          source_messages TEXT NOT NULL,
          thread_ts TEXT,
          latest_reply_ts TEXT,
          author_name TEXT NOT NULL,
          source_text TEXT NOT NULL,
          topic_summary TEXT NOT NULL,
          action_type TEXT NOT NULL CHECK(action_type IN ('reply', 'create_task', 'update_document', 'info_only')),
          suggested_action TEXT,
          context_used TEXT,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'edited', 'dismissed', 'executed')),
          resolved_at DATETIME,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_slack_triage_items_channel_link
          ON slack_triage_items(channel_link_id);
        CREATE INDEX IF NOT EXISTS idx_slack_triage_items_status
          ON slack_triage_items(channel_link_id, status);
      `);
    },
  },
  {
    id: 1064,
    name: '064_add_context_directories_to_projects',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        ALTER TABLE projects ADD COLUMN context_directories TEXT;
      `);
    },
  },
  {
    id: 1065,
    name: '065_add_agent_columns_to_dev_sessions',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        ALTER TABLE dev_sessions ADD COLUMN agent_type TEXT NOT NULL DEFAULT 'claude';
        ALTER TABLE dev_sessions ADD COLUMN agent_state TEXT NOT NULL DEFAULT 'inactive';
      `);
    },
  },
  {
    id: 1066,
    name: '066_scope_global_search_uniqueness_by_project',
    up: (db: BetterSqliteDatabase) => {
      const hasSearchIndex = db.prepare(`
        SELECT EXISTS(
          SELECT 1 FROM sqlite_master
          WHERE type = 'table' AND name = 'global_search_index'
        ) as has_index
      `).get() as { has_index: number };

      if (hasSearchIndex.has_index !== 1) {
        return;
      }

      db.exec(`
        PRAGMA foreign_keys = OFF;

        DROP TRIGGER IF EXISTS trg_global_search_index_ai;
        DROP TRIGGER IF EXISTS trg_global_search_index_ad;
        DROP TRIGGER IF EXISTS trg_global_search_index_au;
        DROP TRIGGER IF EXISTS trg_plan_items_search_ai;
        DROP TRIGGER IF EXISTS trg_plan_items_search_au;
        DROP TRIGGER IF EXISTS trg_plan_items_search_ad;
        DROP TRIGGER IF EXISTS trg_inbox_items_search_ai;
        DROP TRIGGER IF EXISTS trg_inbox_items_search_au;
        DROP TRIGGER IF EXISTS trg_inbox_items_search_ad;
        DROP INDEX IF EXISTS idx_global_search_project_type_updated;
        DROP TABLE IF EXISTS global_search_fts;

        ALTER TABLE global_search_index RENAME TO global_search_index_old;

        CREATE TABLE global_search_index (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL CHECK (entity_type IN ('plan_item', 'document', 'inbox_item')),
          entity_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT,
          status_category TEXT,
          label TEXT,
          external_key TEXT,
          chat_session_id TEXT,
          suggested_type TEXT,
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
          chat_session_id,
          suggested_type,
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
          chat_session_id,
          suggested_type,
          updated_at
        FROM global_search_index_old;

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

        CREATE TRIGGER trg_inbox_items_search_ai
        AFTER INSERT ON inbox_items
        WHEN new.status = 'active'
        BEGIN
          DELETE FROM global_search_index
          WHERE project_id = new.project_id AND entity_type = 'inbox_item' AND entity_id = new.id;
          INSERT INTO global_search_index (
            entity_type, entity_id, project_id, title, body, suggested_type, updated_at
          )
          VALUES (
            'inbox_item',
            new.id,
            new.project_id,
            substr(COALESCE(new.enhanced_content, new.raw_content), 1, 80),
            COALESCE(new.enhanced_content, new.raw_content),
            new.suggested_type,
            new.updated_at
          );
        END;

        CREATE TRIGGER trg_inbox_items_search_au
        AFTER UPDATE ON inbox_items
        BEGIN
          DELETE FROM global_search_index
          WHERE project_id = old.project_id AND entity_type = 'inbox_item' AND entity_id = old.id;
          INSERT INTO global_search_index (
            entity_type, entity_id, project_id, title, body, suggested_type, updated_at
          )
          SELECT
            'inbox_item',
            new.id,
            new.project_id,
            substr(COALESCE(new.enhanced_content, new.raw_content), 1, 80),
            COALESCE(new.enhanced_content, new.raw_content),
            new.suggested_type,
            new.updated_at
          WHERE new.status = 'active';
        END;

        CREATE TRIGGER trg_inbox_items_search_ad
        AFTER DELETE ON inbox_items
        BEGIN
          DELETE FROM global_search_index
          WHERE project_id = old.project_id AND entity_type = 'inbox_item' AND entity_id = old.id;
        END;

        INSERT INTO global_search_fts(global_search_fts) VALUES ('rebuild');

        DROP TABLE global_search_index_old;

        PRAGMA foreign_keys = ON;
      `);
    },
  },
  {
    id: 1067,
    name: '067_persist_agent_reviews',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_review_runs (
          id TEXT PRIMARY KEY,
          implementation_session_id TEXT NOT NULL REFERENCES dev_sessions(id) ON DELETE CASCADE,
          review_session_id TEXT NOT NULL,
          reviewer_agent TEXT NOT NULL CHECK(reviewer_agent IN ('claude', 'codex', 'gemini')),
          status TEXT NOT NULL CHECK(status IN ('complete', 'stale')),
          diff_fingerprint TEXT,
          raw_output TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS agent_review_findings (
          id TEXT PRIMARY KEY,
          review_run_id TEXT NOT NULL REFERENCES agent_review_runs(id) ON DELETE CASCADE,
          finding_order INTEGER NOT NULL,
          severity TEXT NOT NULL CHECK(severity IN ('critical', 'warning', 'suggestion')),
          file TEXT NOT NULL,
          line INTEGER,
          description TEXT NOT NULL,
          agent TEXT NOT NULL CHECK(agent IN ('claude', 'codex', 'gemini')),
          source TEXT NOT NULL CHECK(source IN ('agent', 'pr')),
          UNIQUE(review_run_id, finding_order)
        );

        CREATE INDEX IF NOT EXISTS idx_agent_review_runs_implementation
          ON agent_review_runs(implementation_session_id, completed_at DESC, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_agent_review_runs_status
          ON agent_review_runs(implementation_session_id, status);
        CREATE INDEX IF NOT EXISTS idx_agent_review_findings_run
          ON agent_review_findings(review_run_id, finding_order);
      `);
    },
  },
  {
    id: 1068,
    name: '068_add_dev_session_automation_phase',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        ALTER TABLE dev_sessions ADD COLUMN automation_phase TEXT
          CHECK(automation_phase IN ('idle', 'reviewing', 'addressing_review', 'ready_for_review', 'needs_attention'));
      `);
    },
  },
  {
    id: 1069,
    name: '069_add_dev_session_merge_order',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        ALTER TABLE dev_sessions ADD COLUMN merge_order INTEGER;
      `);
    },
  },
  {
    id: 1070,
    name: '070_add_repo_active_worktree_path',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        ALTER TABLE repos ADD COLUMN active_worktree_path TEXT;
      `);
    },
  },

  {
    id: 1071,
    name: '071_add_repo_setup_command',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        ALTER TABLE repos ADD COLUMN setup_command TEXT;
      `);
    },
  },

  {
    id: 1072,
    name: '072_reset_setting_up_sessions',
    up: (db: BetterSqliteDatabase) => {
      // Sessions stuck in setting_up from a prior crash become inactive so users can retry
      db.exec(`
        UPDATE dev_sessions SET status = 'inactive' WHERE status = 'setting_up';
      `);
    },
  },

  {
    id: 1073,
    name: '073_add_plan_item_spec_fields',
    up: (db: BetterSqliteDatabase) => {
      // Structured spec fields: carry commitment from chat iteration doc → plan item → agent.
      // acceptance_criteria is JSON-encoded string[] (same pattern as code_refs).
      // source_document_id is a loose reference (no FK) to a project document, so docs can be
      // deleted/renamed without cascading into plan items.
      db.exec(`
        ALTER TABLE plan_items ADD COLUMN intent TEXT;
        ALTER TABLE plan_items ADD COLUMN acceptance_criteria TEXT;
        ALTER TABLE plan_items ADD COLUMN source_document_id TEXT;
      `);
    },
  },
  {
    id: 1074,
    name: '074_custom_themes',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        -- ============================================
        -- CUSTOM THEMES: sanitized user-imported themes
        -- ============================================
        CREATE TABLE IF NOT EXISTS custom_themes (
          id TEXT PRIMARY KEY,
          source_key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          colors_json TEXT NOT NULL,
          preview_json TEXT NOT NULL,
          vscode_json TEXT NOT NULL,
          source_json TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_custom_themes_updated_at ON custom_themes(updated_at);
      `);
    },
  },
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
  {
    id: 1076,
    name: '076_chat_sessions_title',
    up: (db: BetterSqliteDatabase) => {
      // SDK-derived display title (auto-summary or user-renamed via /rename)
      // surfaced in live tabs and the history dropdown. NULL for older rows;
      // history queries fall back to the first user message for those.
      db.exec(`ALTER TABLE chat_sessions ADD COLUMN title TEXT;`);
    },
  },
  {
    id: 1077,
    name: '077_drop_dev_session_mode_columns',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        ALTER TABLE dev_sessions DROP COLUMN requested_mode;
        ALTER TABLE dev_sessions DROP COLUMN effective_mode;
      `);
    },
  },
  {
    id: 1078,
    name: '078_claude_usage_events',
    up: (db: BetterSqliteDatabase) => {
      // Append-only event log of Claude API usage. One row per result/turn.
      // project_id is nullable so we can record usage for cross-project features
      // (e.g. onboarding before a project is selected).
      db.exec(`
        CREATE TABLE IF NOT EXISTS claude_usage_events (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
          source TEXT NOT NULL,
          model TEXT NOT NULL,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
          cache_read_tokens INTEGER NOT NULL DEFAULT 0,
          cost_micro_usd INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_claude_usage_project_created
          ON claude_usage_events(project_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_claude_usage_created
          ON claude_usage_events(created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_claude_usage_source
          ON claude_usage_events(source);
      `);
    },
  },
  {
    id: 1079,
    name: '079_drop_documents_table',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        PRAGMA foreign_keys = OFF;

        DROP INDEX IF EXISTS idx_documents_project;
        DROP TABLE IF EXISTS documents;

        PRAGMA foreign_keys = ON;
      `);
    },
  },
  {
    id: 1080,
    name: '080_drop_agent_prompts',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        DROP INDEX IF EXISTS idx_agent_prompts_project;
        DROP INDEX IF EXISTS idx_agent_prompts_global_unique;
        DROP INDEX IF EXISTS idx_agent_prompts_default_project_role;
        DROP INDEX IF EXISTS idx_agent_prompts_default_global_role;
        DROP TABLE IF EXISTS agent_prompts;
      `);
    },
  },
  {
    id: 1081,
    name: '081_project_file_metadata',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_file_metadata (
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          path TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          summary TEXT,
          summarized_at DATETIME,
          PRIMARY KEY (project_id, path)
        );

        CREATE INDEX IF NOT EXISTS idx_project_file_metadata_project
          ON project_file_metadata(project_id);
      `);
    },
  },
  {
    id: 1082,
    name: '082_projects_git_root',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`ALTER TABLE projects ADD COLUMN git_root TEXT;`);
    },
  },
  {
    id: 1083,
    name: '083_drop_projects_git_root',
    up: (db: BetterSqliteDatabase) => {
      // Reverts the user-set git boundary added in 082. KPM now derives the
      // git boundary from disk on every project open (`findEnclosingGitRoot`),
      // so the stored field is dead weight. Drop is safe — no other code reads
      // the column after this migration applies.
      db.exec(`ALTER TABLE projects DROP COLUMN git_root;`);
    },
  },
  {
    id: 1084,
    name: '084_review_sync_state_probe',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        ALTER TABLE review_sync_state ADD COLUMN last_pr_updated_at DATETIME;
        ALTER TABLE review_sync_state ADD COLUMN probe_digest TEXT;
      `);
    },
  },
  {
    id: 1086,
    name: '086_claude_usage_project_name_snapshot',
    up: (db: BetterSqliteDatabase) => {
      // Two changes so deleted/renamed projects stay legible in the usage dashboard:
      //   1. Drop the FK on project_id so ON DELETE SET NULL no longer collapses
      //      every deleted project's events into one Unattributed bucket. The
      //      column becomes plain TEXT — events keep their original project_id
      //      even after the project row is gone, so each shows as its own row.
      //   2. Add project_name_snapshot (captured at insert). Queries
      //      COALESCE(projects.name, project_name_snapshot) so live renames
      //      win while the project still exists, and the snapshot is the
      //      fallback once it's deleted.
      // Backfill snapshots from currently-live projects so existing rows pick
      // up names retroactively. Rows whose project was already deleted (and
      // therefore already nulled by the old SET NULL cascade) cannot be
      // recovered and remain Unattributed.
      db.exec(`
        PRAGMA foreign_keys = OFF;

        CREATE TABLE claude_usage_events_new (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          project_name_snapshot TEXT,
          source TEXT NOT NULL,
          model TEXT NOT NULL,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
          cache_read_tokens INTEGER NOT NULL DEFAULT 0,
          cost_micro_usd INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO claude_usage_events_new (
          id, project_id, project_name_snapshot, source, model,
          input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
          cost_micro_usd, created_at
        )
        SELECT
          u.id, u.project_id, p.name, u.source, u.model,
          u.input_tokens, u.output_tokens, u.cache_creation_tokens, u.cache_read_tokens,
          u.cost_micro_usd, u.created_at
        FROM claude_usage_events u
        LEFT JOIN projects p ON p.id = u.project_id;

        DROP TABLE claude_usage_events;
        ALTER TABLE claude_usage_events_new RENAME TO claude_usage_events;

        CREATE INDEX IF NOT EXISTS idx_claude_usage_project_created
          ON claude_usage_events(project_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_claude_usage_created
          ON claude_usage_events(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_claude_usage_source
          ON claude_usage_events(source);

        PRAGMA foreign_keys = ON;
      `);
    },
  },
  {
    id: 1087,
    name: '087_plan_item_tracker_people',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        ALTER TABLE plan_items ADD COLUMN external_assignee_id TEXT;
        ALTER TABLE plan_items ADD COLUMN external_assignee_name TEXT;
        ALTER TABLE plan_items ADD COLUMN external_assignee_avatar_url TEXT;
        ALTER TABLE plan_items ADD COLUMN external_creator_id TEXT;
        ALTER TABLE plan_items ADD COLUMN external_creator_name TEXT;
        ALTER TABLE plan_items ADD COLUMN external_creator_avatar_url TEXT;

        CREATE INDEX IF NOT EXISTS idx_plan_items_external_assignee
          ON plan_items(project_id, external_assignee_id)
          WHERE external_assignee_id IS NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_plan_items_external_creator
          ON plan_items(project_id, external_creator_id)
          WHERE external_creator_id IS NOT NULL;
      `);
    },
  },
  {
    id: 1088,
    name: '088_claude_usage_sdk_cost_snapshots',
    up: (db: BetterSqliteDatabase) => {
      // SDK result costs are cumulative for persistent Agent SDK sessions.
      // Keep the raw cumulative snapshot for audit/delta calculation, while
      // cost_micro_usd remains the additive per-event value used by dashboards.
      db.exec(`
        ALTER TABLE claude_usage_events ADD COLUMN sdk_session_id TEXT;
        ALTER TABLE claude_usage_events ADD COLUMN sdk_result_uuid TEXT;
        ALTER TABLE claude_usage_events ADD COLUMN sdk_cost_scope TEXT;
        ALTER TABLE claude_usage_events ADD COLUMN sdk_cumulative_cost_micro_usd INTEGER;
        ALTER TABLE claude_usage_events ADD COLUMN cost_source TEXT NOT NULL DEFAULT 'legacy';

        CREATE INDEX IF NOT EXISTS idx_claude_usage_sdk_cost_scope
          ON claude_usage_events(sdk_session_id, sdk_cost_scope, created_at DESC)
          WHERE sdk_session_id IS NOT NULL AND sdk_cost_scope IS NOT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_claude_usage_sdk_result_scope
          ON claude_usage_events(sdk_session_id, sdk_result_uuid, sdk_cost_scope, source)
          WHERE sdk_session_id IS NOT NULL
            AND sdk_result_uuid IS NOT NULL
            AND sdk_cost_scope IS NOT NULL;
      `);
    },
  },
  {
    id: 1089,
    name: '089_dev_sessions_base_sha',
    up: (db: BetterSqliteDatabase) => {
      // The commit/diff "Changes" views identify a task's work as the range
      // base..HEAD. Storing only the base branch *name* (e.g. 'main') meant the
      // base was re-resolved at query time against a moving ref (origin/main),
      // so an unrelated commit could be attributed to the wrong task. Capture
      // the immutable fork-point SHA when the worktree is created and range
      // against that instead. Nullable; legacy rows fall back to merge-base.
      db.exec(`ALTER TABLE dev_sessions ADD COLUMN base_sha TEXT;`);
    },
  },
  {
    id: 1090,
    name: '090_custom_prompt_targets',
    up: (db: BetterSqliteDatabase) => {
      // Custom prompts can target an entity (a document or a connected repo).
      // Targeted prompts run through chat with the target attached as a
      // focused resource; untargeted prompts keep the artifact pipeline.
      db.exec(`
        ALTER TABLE custom_prompts ADD COLUMN target_type TEXT NOT NULL DEFAULT 'none'
          CHECK(target_type IN ('none', 'document', 'repo'));
        ALTER TABLE custom_prompts ADD COLUMN run_mode TEXT NOT NULL DEFAULT 'artifact'
          CHECK(run_mode IN ('artifact', 'chat'));
      `);
    },
  },
  {
    id: 1091,
    name: '091_focus_document_chat_sessions',
    up: (db: BetterSqliteDatabase) => {
      db.exec(`
        ALTER TABLE chat_sessions ADD COLUMN scope TEXT NOT NULL DEFAULT 'main'
          CHECK(scope IN ('main', 'focus_document'));
        ALTER TABLE chat_sessions ADD COLUMN focus_document_path TEXT;
        ALTER TABLE chat_sessions ADD COLUMN focus_document_title TEXT;
        ALTER TABLE chat_sessions ADD COLUMN focus_document_hash TEXT;
        ALTER TABLE chat_sessions ADD COLUMN last_opened_at DATETIME;

        CREATE INDEX IF NOT EXISTS idx_chat_sessions_project_scope
          ON chat_sessions(project_id, scope);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_sessions_focus_document
          ON chat_sessions(project_id, focus_document_path)
          WHERE scope = 'focus_document' AND focus_document_path IS NOT NULL;
      `);
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
 * Copy the database file aside before applying migrations so a buggy or
 * interrupted migration can't destroy the only copy of the user's data.
 *
 * Skipped for in-memory databases and for brand-new databases (no recorded
 * migrations yet): backing up a fresh empty file would overwrite a backup
 * that may still hold data from a previous install. Best-effort — a failed
 * backup logs a warning but does not block migrations.
 */
function backupBeforeMigrations(db: BetterSqliteDatabase): void {
  const hasHistory = (
    db.prepare('SELECT EXISTS (SELECT 1 FROM schema_migrations LIMIT 1) AS has_history').get() as {
      has_history: number;
    }
  ).has_history;
  if (!hasHistory) {
    return;
  }

  const row = db.prepare('PRAGMA database_list').get() as { file?: string } | undefined;
  const file = row?.file;
  if (!file) {
    return; // in-memory database
  }

  try {
    // Fold the WAL into the main file so the copy is complete
    db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(file, `${file}.bak`);
    console.log(`[Migrations] Backed up database to ${file}.bak`);
  } catch (err) {
    console.warn('[Migrations] Pre-migration backup failed:', err);
  }
}

/**
 * Run all pending migrations.
 * Call this after setupSchema() to apply any new migrations.
 */
export function runMigrations(db: BetterSqliteDatabase): void {
  console.log('[Migrations] Checking for pending migrations...');

  // Ensure the migrations table exists before checking applied migrations
  ensureMigrationsTable(db);

  const pending = migrations.filter((migration) => !isMigrationApplied(db, migration.name));

  if (pending.length === 0) {
    console.log('[Migrations] No pending migrations.');
    return;
  }

  backupBeforeMigrations(db);

  for (const migration of pending) {
    console.log(`[Migrations] Applying migration: ${migration.name}`);

    // Run migration in a transaction for safety
    const transaction = db.transaction(() => {
      migration.up(db);
      recordMigration(db, migration.id, migration.name);
    });

    transaction();
  }

  console.log(`[Migrations] Applied ${pending.length} migration(s).`);
}
