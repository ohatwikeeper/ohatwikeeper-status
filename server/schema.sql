-- 追加のみ(履歴は消さない)。障害時のチェックの詳細(原因種別・対象・安全な応答ヘッダー)を保存する
CREATE TABLE IF NOT EXISTS service_check_details (
  check_id BIGINT NOT NULL PRIMARY KEY,
  detail JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
