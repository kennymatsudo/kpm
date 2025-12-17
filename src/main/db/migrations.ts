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
