SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Core document store -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT UNIQUE NOT NULL,
    canonical_url TEXT,
    domain TEXT NOT NULL,
    path TEXT,
    -- Source provenance
    source_slug TEXT,
    source_name TEXT,
    -- Content classification
    content_type VARCHAR(30),            -- guide | reference | tutorial | api | blog
    section_path TEXT,                   -- breadcrumb-derived path (e.g. "Learn > Hooks > useState")
    -- Metadata
    title TEXT,
    meta_description TEXT,
    language VARCHAR(10),
    published_at TIMESTAMP NULL,
    last_updated_at TIMESTAMP NULL,      -- separately extracted "last updated" date
    -- Quality signals
    content_hash TEXT NOT NULL,
    word_count INT,
    code_block_count INT NOT NULL DEFAULT 0,
    boost_score INT NOT NULL DEFAULT 0,
    authority_score FLOAT NOT NULL DEFAULT 0,
    -- Operational
    freshness_status VARCHAR(20) NOT NULL DEFAULT 'unknown',  -- fresh | ok | stale | failing | unknown
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    last_crawled_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Full document content (kept separate to avoid fetching large blobs on list queries)
CREATE TABLE IF NOT EXISTS document_content (
    document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    raw_html TEXT,
    clean_text TEXT,
    headings JSONB NOT NULL DEFAULT '[]'::jsonb,
    links JSONB NOT NULL DEFAULT '[]'::jsonb,
    schema_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Per-source metadata and health ------------------------------------------------
CREATE TABLE IF NOT EXISTS source_registry (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    home_url TEXT NOT NULL,
    authority_weight FLOAT NOT NULL DEFAULT 5,
    crawl_cadence_hours INT NOT NULL DEFAULT 168,
    last_crawled_at TIMESTAMP NULL,
    doc_count INT NOT NULL DEFAULT 0,
    crawl_status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | crawling | healthy | failing
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Crawl queue -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crawl_queue (
    id BIGSERIAL PRIMARY KEY,
    url TEXT UNIQUE NOT NULL,
    normalized_url TEXT UNIQUE NOT NULL,
    domain TEXT NOT NULL,
    depth INT NOT NULL DEFAULT 0,
    source_url TEXT,
    source_slug TEXT,                    -- which source registry entry owns this URL
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    priority INT NOT NULL DEFAULT 100,
    retry_count INT NOT NULL DEFAULT 0,
    scheduled_at TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP NULL
);

-- Crawl attempt log -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crawl_logs (
    id BIGSERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    status_code INT,
    content_type TEXT,
    response_time_ms INT,
    error_message TEXT,
    fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Search analytics --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_analytics (
    id BIGSERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    results_count INT NOT NULL DEFAULT 0,
    latency_ms INT NOT NULL DEFAULT 0,
    clicked_document_id UUID NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documents_domain ON documents(domain);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_source_slug ON documents(source_slug);
CREATE INDEX IF NOT EXISTS idx_documents_content_type ON documents(content_type);
CREATE INDEX IF NOT EXISTS idx_crawl_queue_status_priority ON crawl_queue(status, priority, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_crawl_queue_source_slug ON crawl_queue(source_slug);
CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics(query);
CREATE INDEX IF NOT EXISTS idx_search_analytics_created_at ON search_analytics(created_at);
"""

# Additive migration: applied after CREATE TABLE IF NOT EXISTS so that existing
# installations gain new columns without data loss.
MIGRATION_SQL = """
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_slug TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_type VARCHAR(30);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS section_path TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS code_block_count INT NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS boost_score INT NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS authority_score FLOAT NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS freshness_status VARCHAR(20) NOT NULL DEFAULT 'unknown';

ALTER TABLE crawl_queue ADD COLUMN IF NOT EXISTS source_slug TEXT;

CREATE TABLE IF NOT EXISTS source_registry (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    home_url TEXT NOT NULL,
    authority_weight FLOAT NOT NULL DEFAULT 5,
    crawl_cadence_hours INT NOT NULL DEFAULT 168,
    last_crawled_at TIMESTAMP NULL,
    doc_count INT NOT NULL DEFAULT 0,
    crawl_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_source_slug ON documents(source_slug);
CREATE INDEX IF NOT EXISTS idx_documents_content_type ON documents(content_type);
CREATE INDEX IF NOT EXISTS idx_crawl_queue_source_slug ON crawl_queue(source_slug);
CREATE INDEX IF NOT EXISTS idx_search_analytics_created_at ON search_analytics(created_at);
"""
