SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT UNIQUE NOT NULL,
    canonical_url TEXT,
    domain TEXT NOT NULL,
    path TEXT,
    title TEXT,
    meta_description TEXT,
    language VARCHAR(10),
    published_at TIMESTAMP NULL,
    content_hash TEXT NOT NULL,
    word_count INT,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    last_crawled_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_content (
    document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    raw_html TEXT,
    clean_text TEXT,
    headings JSONB NOT NULL DEFAULT '[]'::jsonb,
    links JSONB NOT NULL DEFAULT '[]'::jsonb,
    schema_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS crawl_queue (
    id BIGSERIAL PRIMARY KEY,
    url TEXT UNIQUE NOT NULL,
    normalized_url TEXT UNIQUE NOT NULL,
    domain TEXT NOT NULL,
    depth INT NOT NULL DEFAULT 0,
    source_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    priority INT NOT NULL DEFAULT 100,
    retry_count INT NOT NULL DEFAULT 0,
    scheduled_at TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS crawl_logs (
    id BIGSERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    status_code INT,
    content_type TEXT,
    response_time_ms INT,
    error_message TEXT,
    fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS search_analytics (
    id BIGSERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    results_count INT NOT NULL DEFAULT 0,
    latency_ms INT NOT NULL DEFAULT 0,
    clicked_document_id UUID NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_domain ON documents(domain);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_crawl_queue_status_priority ON crawl_queue(status, priority, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics(query);
"""

