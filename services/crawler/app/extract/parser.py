from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256
from typing import Any
from urllib.parse import urlparse, urljoin

import trafilatura
from bs4 import BeautifulSoup


WHITESPACE_RE = re.compile(r"\s+")

# URL path segments that signal a specific content type
_CONTENT_TYPE_URL_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"/(api[-_/]reference|api-docs|api[-/]v\d|openapi)/", re.I), "reference"),
    (re.compile(r"/(reference|class[-/]|interface[-/]|type[-/]|namespace[-/]|enum[-/])/", re.I), "reference"),
    (re.compile(r"/(tutorials?|step[-_]by[-_]step|walkthroughs?)/", re.I), "tutorial"),
    (re.compile(r"/(guides?|how[-_]to|getting[-_]started|quickstart|cookbook)/", re.I), "guide"),
    (re.compile(r"/(learn|introduction|overview|concepts?|fundamentals?)/", re.I), "guide"),
    (re.compile(r"/(blog|posts?|news|articles?|changelog|release[-_]notes?)/", re.I), "blog"),
]

# Title-level signals for content type
_CONTENT_TYPE_TITLE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bAPI\b.*\breference\b|\breference\b.*\bAPI\b", re.I), "reference"),
    (re.compile(r"\b(class|interface|type|namespace|enum|function|method|property)\b", re.I), "reference"),
    (re.compile(r"\btutorial\b|\bwalkthrough\b|\bstep.by.step\b", re.I), "tutorial"),
    (re.compile(r"\b(guide|overview|introduction|getting started)\b", re.I), "guide"),
]


@dataclass(slots=True)
class ParsedDocument:
    title: str
    meta_description: str
    canonical_url: str
    language: str | None
    published_at: datetime | None
    last_updated_at: datetime | None
    headings: list[str]
    links: list[str]
    body: str
    content_hash: str
    word_count: int
    code_block_count: int
    tags: list[str]
    schema_json: dict[str, Any]
    content_type: str            # guide | reference | tutorial | api | blog
    section_path: str            # breadcrumb-derived, e.g. "Learn > Hooks > useState"


def clean_text(text: str) -> str:
    return WHITESPACE_RE.sub(" ", text or "").strip()


def _extract_schema_json(soup: BeautifulSoup) -> dict[str, Any]:
    for tag in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(tag.get_text(strip=True))
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            continue
    return {}


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None


def _extract_published_at(soup: BeautifulSoup, schema_json: dict[str, Any]) -> datetime | None:
    candidates: list[str | None] = [
        schema_json.get("datePublished") if isinstance(schema_json, dict) else None,
        (soup.find("meta", attrs={"property": "article:published_time"}) or {}).get("content"),
        (soup.find("meta", attrs={"name": "pubdate"}) or {}).get("content"),
        (soup.find("meta", attrs={"name": "date"}) or {}).get("content"),
    ]
    time_tag = soup.find("time")
    if time_tag:
        candidates.append(time_tag.get("datetime"))

    for value in candidates:
        result = _parse_datetime(value)
        if result:
            return result
    return None


def _extract_last_updated_at(soup: BeautifulSoup, schema_json: dict[str, Any]) -> datetime | None:
    """Extract the 'last updated' date, which may differ from the publish date."""
    candidates: list[str | None] = [
        schema_json.get("dateModified") if isinstance(schema_json, dict) else None,
        (soup.find("meta", attrs={"property": "article:modified_time"}) or {}).get("content"),
        (soup.find("meta", attrs={"name": "last-modified"}) or {}).get("content"),
        (soup.find("meta", attrs={"http-equiv": "last-modified"}) or {}).get("content"),
    ]
    # Look for visible "last updated" text patterns near time elements
    for time_tag in soup.find_all("time"):
        dt = time_tag.get("datetime")
        if dt:
            # Prefer time elements that have "updated" context nearby
            parent_text = (time_tag.parent.get_text(" ", strip=True) if time_tag.parent else "").lower()
            if any(w in parent_text for w in ("updated", "modified", "last edited", "edited")):
                candidates.insert(0, dt)
            else:
                candidates.append(dt)

    for value in candidates:
        result = _parse_datetime(value)
        if result:
            return result
    return None


def _detect_content_type(url: str, soup: BeautifulSoup, title: str) -> str:
    """Classify the document as guide, reference, tutorial, api, or blog."""
    url_path = urlparse(url).path

    # 1. URL path signals (most reliable)
    for pattern, content_type in _CONTENT_TYPE_URL_PATTERNS:
        if pattern.search(url_path):
            return content_type

    # 2. Title signals
    for pattern, content_type in _CONTENT_TYPE_TITLE_PATTERNS:
        if pattern.search(title):
            return content_type

    # 3. Structural signals — dense code blocks suggest reference/api
    pre_count = len(soup.select("pre"))
    if pre_count >= 5:
        return "reference"

    return "guide"


def _extract_section_path(url: str, soup: BeautifulSoup) -> str:
    """Return a human-readable breadcrumb path for the document."""
    # Ordered list of breadcrumb selectors (most specific first)
    breadcrumb_anchor_selectors = [
        'nav[aria-label*="breadcrumb" i] a',
        'nav[aria-label*="Breadcrumb" i] a',
        'ol[itemtype*="BreadcrumbList"] a',
        '[class*="breadcrumb"] a',
        '[data-testid*="breadcrumb"] a',
        '.breadcrumbs a',
        'nav.breadcrumb a',
    ]
    for selector in breadcrumb_anchor_selectors:
        elements = soup.select(selector)
        parts = [clean_text(el.get_text(" ", strip=True)) for el in elements]
        parts = [p for p in parts if p and len(p) < 80]
        if len(parts) >= 2:
            return " > ".join(parts[:5])

    # Schema.org BreadcrumbList
    breadcrumb_schema = None
    schema_json = _extract_schema_json(soup)
    if isinstance(schema_json, dict):
        if schema_json.get("@type") == "BreadcrumbList":
            breadcrumb_schema = schema_json
        elif "@graph" in schema_json:
            for node in schema_json.get("@graph", []):
                if isinstance(node, dict) and node.get("@type") == "BreadcrumbList":
                    breadcrumb_schema = node
                    break
    if breadcrumb_schema:
        items = breadcrumb_schema.get("itemListElement", [])
        parts = [item.get("name", "") for item in items if isinstance(item, dict)]
        parts = [clean_text(p) for p in parts if p]
        if len(parts) >= 2:
            return " > ".join(parts[:5])

    # Fallback: derive from URL path segments
    path_parts = [seg for seg in urlparse(url).path.split("/") if seg]
    skip = {"docs", "en", "us", "current", "en-us", "en-gb", "latest"}
    cleaned = []
    for seg in path_parts:
        seg_clean = re.sub(r"\.(html?|md)$", "", seg)
        seg_clean = seg_clean.replace("-", " ").replace("_", " ").title()
        if seg_clean.lower() not in skip and len(seg_clean) > 1:
            cleaned.append(seg_clean)
    if len(cleaned) >= 2:
        return " > ".join(cleaned[:4])
    return ""


def _count_code_blocks(soup: BeautifulSoup) -> int:
    """Count meaningful code blocks (pre elements and standalone fenced code elements)."""
    # Each <pre> is a meaningful code block
    pre_count = len(soup.select("pre"))
    # Count <code> elements NOT inside <pre> that have substantial content (> 30 chars)
    inline_standalone = sum(
        1
        for el in soup.select("code")
        if not el.find_parent("pre") and len(el.get_text(strip=True)) > 30
    )
    return pre_count + inline_standalone


def parse_html(url: str, html: str, source_slug: str | None = None) -> ParsedDocument:
    soup = BeautifulSoup(html, "lxml")
    extracted = trafilatura.extract(html, include_links=False, include_images=False) or ""

    title = clean_text(
        (soup.title.string if soup.title and soup.title.string else "")
        or (soup.find("meta", attrs={"property": "og:title"}) or {}).get("content", "")
        or (soup.find("h1").get_text(" ", strip=True) if soup.find("h1") else "")
    )
    description = clean_text(
        (soup.find("meta", attrs={"name": "description"}) or {}).get("content", "")
        or (soup.find("meta", attrs={"property": "og:description"}) or {}).get("content", "")
    )
    if not description:
        paragraph = soup.find("p")
        description = clean_text(paragraph.get_text(" ", strip=True) if paragraph else "")

    canonical = (soup.find("link", attrs={"rel": "canonical"}) or {}).get("href", url)
    language = soup.html.get("lang") if soup.html else None
    headings = [clean_text(node.get_text(" ", strip=True)) for node in soup.select("h1, h2, h3")]
    links = [urljoin(url, anchor.get("href")) for anchor in soup.select("a[href]")]
    schema_json = _extract_schema_json(soup)
    published_at = _extract_published_at(soup, schema_json)
    last_updated_at = _extract_last_updated_at(soup, schema_json)

    body = clean_text(extracted or soup.get_text(" ", strip=True))
    body = body[:50_000]
    tags = [
        clean_text(value)
        for value in ((soup.find("meta", attrs={"name": "keywords"}) or {}).get("content", "")).split(",")
        if clean_text(value)
    ]
    content_hash = sha256(body.encode("utf-8")).hexdigest()
    content_type = _detect_content_type(url, soup, title)
    section_path = _extract_section_path(url, soup)
    code_block_count = _count_code_blocks(soup)

    return ParsedDocument(
        title=title,
        meta_description=description,
        canonical_url=canonical,
        language=language,
        published_at=published_at,
        last_updated_at=last_updated_at,
        headings=[h for h in headings if h],
        links=links,
        body=body,
        content_hash=content_hash,
        word_count=len(body.split()),
        code_block_count=code_block_count,
        tags=tags,
        schema_json=schema_json,
        content_type=content_type,
        section_path=section_path,
    )
