export const migration = `
CREATE TABLE IF NOT EXISTS crm_mirror_contact_submissions (
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
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
