# Schema Overview

## PostgreSQL Tables

- `documents`
- `document_content`
- `crawl_queue`
- `crawl_logs`
- `search_analytics`

## Meilisearch Index

Primary index: `documents`

- Searchable: `title`, `headings`, `meta_description`, `body`, `tags`
- Filterable: `domain`, `language`, `published_at`, `tags`
- Sortable: `published_at`, `word_count`, `boost_score`

