from __future__ import annotations

import json
from typing import Any


def dump_json(data: Any) -> str:
  return json.dumps(data, ensure_ascii=False)


def load_json(data: str | None, default: Any) -> Any:
  if not data:
    return default
  try:
    return json.loads(data)
  except json.JSONDecodeError:
    return default
