from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256
from typing import Any
from urllib.parse import urljoin

import trafilatura
from bs4 import BeautifulSoup


WHITESPACE_RE = re.compile(r"\s+")


@dataclass(slots=True)
class ParsedDocument:
    title: str
    meta_description: str
    canonical_url: str
    language: str | None
    published_at: datetime | None
    headings: list[str]
    links: list[str]
    body: str
    content_hash: str
    word_count: int
    tags: list[str]
    schema_json: dict[str, Any]


def clean_text(text: str) -> str:
    return WHITESPACE_RE.sub(" ", text or "").strip()


def _extract_schema_json(soup: BeautifulSoup) -> dict[str, Any]:
    for tag in soup.select('script[type="application/ld+json"]'):
        try:
            return json.loads(tag.get_text(strip=True))
        except json.JSONDecodeError:
            continue
    return {}


def _extract_published_at(soup: BeautifulSoup, schema_json: dict[str, Any]) -> datetime | None:
    candidates = [
        soup.find("meta", attrs={"property": "article:published_time"}),
        soup.find("meta", attrs={"name": "pubdate"}),
        soup.find("time"),
    ]
    schema_date = schema_json.get("datePublished") if isinstance(schema_json, dict) else None
    values = [schema_date]
    values.extend(tag.get("content") if tag and tag.name == "meta" else tag.get("datetime") if tag else None for tag in candidates)
    for value in values:
        if not value:
            continue
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            continue
    return None


def parse_html(url: str, html: str) -> ParsedDocument:
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

    body = clean_text(extracted or soup.get_text(" ", strip=True))
    body = body[:50000]
    tags = [
        clean_text(value)
        for value in ((soup.find("meta", attrs={"name": "keywords"}) or {}).get("content", "")).split(",")
        if clean_text(value)
    ]
    content_hash = sha256(body.encode("utf-8")).hexdigest()

    return ParsedDocument(
        title=title,
        meta_description=description,
        canonical_url=canonical,
        language=language,
        published_at=published_at,
        headings=[heading for heading in headings if heading],
        links=links,
        body=body,
        content_hash=content_hash,
        word_count=len(body.split()),
        tags=tags,
        schema_json=schema_json,
    )

