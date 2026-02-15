from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlmodel import Session, select

from app.db.models import Event

_TRACKING_QUERY_KEYS = {
  'fbclid',
  'gclid',
  'mkt_tok',
  'si',
  'spm',
}

_SOURCE_TAG_BY_HOST = {
  'mp.weixin.qq.com': 'wechat',
  'twitter.com': 'x',
  'x.com': 'x',
  'xiaohongshu.com': 'xhs',
  'xhslink.com': 'xhs',
}


@dataclass
class PreparedIngestPayload:
  event_type: str
  title: str | None
  content: str
  url: str | None
  metadata: dict[str, Any]
  created_at: datetime
  source_tag: str


def normalize_event_type(event_type: str) -> str:
  normalized = clean_text(event_type) or 'note'
  return normalized.lower()


def clean_text(raw: str | None) -> str | None:
  if raw is None:
    return None
  cleaned = raw.replace('\r\n', '\n').replace('\r', '\n').strip()
  lines = cleaned.split('\n')
  normalized_lines = []
  for line in lines:
    normalized_lines.append(re.sub(r'[ \t]+', ' ', line).strip())
  cleaned = '\n'.join(normalized_lines)
  cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
  return cleaned or None


def normalize_url(raw_url: str | None) -> str | None:
  if not raw_url:
    return None
  url = raw_url.strip()
  if not url:
    return None

  parts = urlsplit(url)
  if not parts.scheme or not parts.netloc:
    return url

  scheme = parts.scheme.lower()
  netloc = parts.netloc.lower()
  hostname, sep, port = netloc.rpartition(':')
  if sep and ((scheme == 'http' and port == '80') or (scheme == 'https' and port == '443')):
    netloc = hostname

  path = parts.path or '/'
  if path != '/':
    path = path.rstrip('/')

  query_items = []
  for key, value in parse_qsl(parts.query, keep_blank_values=False):
    key_lower = key.lower()
    if key_lower.startswith('utm_') or key_lower in _TRACKING_QUERY_KEYS:
      continue
    query_items.append((key, value))
  query_items.sort()
  normalized_query = urlencode(query_items, doseq=True)

  return urlunsplit((scheme, netloc, path, normalized_query, ''))


def normalize_timestamp(raw: datetime | None) -> datetime:
  if raw is None:
    return datetime.now(timezone.utc)
  if raw.tzinfo is None:
    return raw.replace(tzinfo=timezone.utc)
  return raw.astimezone(timezone.utc)


def infer_source_tag(source: str, normalized_url: str | None, metadata: dict[str, Any]) -> str:
  if normalized_url:
    host = (urlsplit(normalized_url).hostname or '').lower()
    for suffix, source_tag in _SOURCE_TAG_BY_HOST.items():
      if host == suffix or host.endswith(f'.{suffix}'):
        return source_tag
    return 'web'

  channel = str(metadata.get('channel', '')).lower()
  if 'wechat' in channel:
    return 'wechat'
  if 'xhs' in channel or 'xiaohongshu' in channel:
    return 'xhs'
  if channel == 'x' or 'twitter' in channel:
    return 'x'
  return source if source == 'mobile' else 'web'


def prepare_ingest_payload(
  *,
  source: str,
  event_type: str,
  title: str | None,
  content: str,
  url: str | None,
  timestamp: datetime | None,
  metadata: dict[str, Any],
) -> PreparedIngestPayload:
  cleaned_content = clean_text(content)
  if not cleaned_content:
    raise ValueError('empty content after cleaning')

  normalized_url = normalize_url(url)
  source_tag = infer_source_tag(source, normalized_url, metadata)
  normalized_metadata = dict(metadata)
  normalized_metadata['source_tag'] = source_tag
  if normalized_url:
    normalized_metadata['normalized_url'] = normalized_url

  return PreparedIngestPayload(
    event_type=normalize_event_type(event_type),
    title=clean_text(title),
    content=cleaned_content,
    url=normalized_url,
    metadata=normalized_metadata,
    created_at=normalize_timestamp(timestamp),
    source_tag=source_tag,
  )


def find_recent_duplicate(
  session: Session,
  *,
  source: str,
  prepared: PreparedIngestPayload,
  dedup_window_minutes: int = 10,
) -> Event | None:
  window_start = prepared.created_at - timedelta(minutes=dedup_window_minutes)
  statement = (
    select(Event)
    .where(Event.source == source)
    .where(Event.created_at >= window_start)
    .where(Event.created_at <= prepared.created_at)
    .order_by(Event.created_at.desc())
  )

  if prepared.url:
    statement = statement.where(Event.url == prepared.url)
    return session.exec(statement).first()

  statement = statement.where(Event.event_type == prepared.event_type).where(Event.content == prepared.content)
  if prepared.title:
    statement = statement.where(Event.title == prepared.title)
  return session.exec(statement).first()
