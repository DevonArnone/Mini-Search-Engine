from __future__ import annotations

from functools import lru_cache
from urllib import robotparser
from urllib.parse import urlparse

from app.core.settings import settings


@lru_cache(maxsize=128)
def get_robot_parser(base_url: str) -> robotparser.RobotFileParser:
    parsed = urlparse(base_url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = robotparser.RobotFileParser()
    parser.set_url(robots_url)
    try:
        parser.read()
    except Exception:
        return parser
    return parser


def can_fetch(url: str) -> bool:
    parser = get_robot_parser(url)
    return parser.can_fetch(settings.crawler_user_agent, url)

