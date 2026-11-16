import { ENTITY_TABLES } from "../schemas/entities.mjs";

const commonColumns = `
  source_record_key VARCHAR(512) NOT NULL,
  source_record_id CHAR(36) NULL,
  organization_id CHAR(36) NULL,
  source_sequence BIGINT UNSIGNED NOT NULL DEFAULT 0,
  source_created_at DATETIME(3) NULL,
  source_updated_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  source_event_id CHAR(36) NULL,
  payload JSON NOT NULL,
  synced_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (source_record_key),
  KEY organization_updated_idx (organization_id, source_updated_at),
  KEY source_record_id_idx (source_record_id),
  KEY source_sequence_idx (source_sequence)
`;

const entityTables = ENTITY_TABLES.map((table) => `
CREATE TABLE IF NOT EXISTS \`crm_mirror_${table}\` (
  ${commonColumns}
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`).join("\n");

export const migration = `
CREATE TABLE IF NOT EXISTS mysql_schema_migrations (
  version VARCHAR(128) NOT NULL PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mysql_sync_events (
  event_id CHAR(36) NOT NULL PRIMARY KEY,
  source_sequence BIGINT UNSIGNED NOT NULL,
  entity_type VARCHAR(96) NOT NULL,
  source_record_key VARCHAR(512) NOT NULL,
  organization_id CHAR(36) NULL,
  operation ENUM('INSERT','UPDATE','DELETE','BACKFILL') NOT NULL,
  status ENUM('completed','reconciled') NOT NULL,
  error_code VARCHAR(96) NULL,
  synced_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY source_sequence_unique (source_sequence),
  KEY organization_sync_idx (organization_id, synced_at),
  KEY entity_sync_idx (entity_type, synced_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mysql_sync_progress (
  organization_id CHAR(36) NOT NULL,
  entity_type VARCHAR(96) NOT NULL,
  last_offset BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rows_seen BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  last_error_code VARCHAR(96) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (organization_id, entity_type)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

${entityTables}
`;
