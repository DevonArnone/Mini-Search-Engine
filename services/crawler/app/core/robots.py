from __future__ import annotations

from functools import lru_cache
from urllib import robotparser
from urllib.parse import urlparse

import httpx

from app.core.settings import settings


@lru_cache(maxsize=128)
def _parser_for_origin(origin: str) -> robotparser.RobotFileParser:
    """Fetch and parse robots.txt once per origin, identifying as the crawler."""
    parser = robotparser.RobotFileParser()
    parser.set_url(f"{origin}/robots.txt")
    try:
        response = httpx.get(
            f"{origin}/robots.txt",
            headers={"User-Agent": settings.crawler_user_agent},
            follow_redirects=True,
            timeout=15.0,
        )
    except httpx.HTTPError:
        # Unreachable robots.txt: stay out rather than guess.
        parser.disallow_all = True
        return parser
    if response.status_code in (401, 403) or response.status_code >= 500:
        parser.disallow_all = True
    elif response.status_code >= 400:
        # No robots.txt published: nothing is disallowed.
        parser.allow_all = True
    else:
        parser.parse(response.text.splitlines())
    return parser


def get_robot_parser(url: str) -> robotparser.RobotFileParser:
    parsed = urlparse(url)
    return _parser_for_origin(f"{parsed.scheme}://{parsed.netloc}")


def can_fetch(url: str) -> bool:
    return get_robot_parser(url).can_fetch(settings.crawler_user_agent, url)
