from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
import json
import re

import httpx
from app.db.models import Event
from app.schemas.jobs import DailyPlanPayload, DailyReviewPayload


class LLMService(ABC):
  model_name: str

  @abstractmethod
  def generate_plan(self, target_date: date, events: list[Event]) -> DailyPlanPayload:
    raise NotImplementedError

  @abstractmethod
  def generate_review(self, target_date: date, events: list[Event]) -> DailyReviewPayload:
    raise NotImplementedError


class MockLLMService(LLMService):
  model_name = 'mock-llm-v1'

  def generate_plan(self, target_date: date, events: list[Event]) -> DailyPlanPayload:
    event_count = len(events)
    top_goals = [
      f'聚焦当天最高价值事项（输入 {event_count} 条）',
      '完成一个可验证的关键产出',
      '在晚间复盘前完成明日衔接动作',
    ]
    focus_blocks = [
      '09:30-11:00 深度工作',
      '14:00-15:30 执行推进',
      '20:30-21:00 复盘准备',
    ]
    risks = [
      '输入噪音过高导致优先级失真',
      '临时沟通打断深度工作',
      '任务边界不清造成执行漂移',
    ]
    summary = '先保关键结果，再保认知迭代速度。'

    return DailyPlanPayload(
      date=target_date,
      top_goals=top_goals,
      focus_blocks=focus_blocks,
      risks=risks,
      summary=summary,
    )

  def generate_review(self, target_date: date, events: list[Event]) -> DailyReviewPayload:
    event_count = len(events)
    outcomes = [
      f'处理并沉淀了 {event_count} 条日内输入',
      '完成了至少一个关键事项推进',
    ]
    unfinished = [
      '部分事项缺少明确截止时间',
      '外部沟通输入未完全结构化',
    ]
    cognition_delta = [
      '旧判断：信息越多越好 -> 新判断：高信号输入更关键',
      '旧判断：计划应固定 -> 新判断：计划应围绕反馈快速迭代',
      '旧判断：复盘是记录 -> 新判断：复盘是认知更新机制',
    ]
    tomorrow_first_step = '早上 15 分钟先清理 Inbox 并重排今日 top3。'
    summary = '结果与认知双线推进，明天继续缩短反馈闭环。'

    return DailyReviewPayload(
      date=target_date,
      outcomes=outcomes,
      unfinished=unfinished,
      cognition_delta=cognition_delta,
      tomorrow_first_step=tomorrow_first_step,
      summary=summary,
    )


class OpenAICompatibleLLMService(LLMService):
  def __init__(
    self,
    *,
    api_base: str,
    api_key: str,
    model: str,
    timeout_seconds: float = 30.0,
  ):
    self.api_base = api_base.rstrip('/')
    self.api_key = api_key
    self.model = model
    self.timeout_seconds = timeout_seconds
    self.model_name = f'openai-compatible:{model}'

  def _event_digest(self, events: list[Event]) -> str:
    if not events:
      return '今天暂无采集事件。'

    lines: list[str] = []
    for idx, event in enumerate(events[:80], start=1):
      title = (event.title or '').strip()
      content = event.content.strip().replace('\n', ' ')
      if len(content) > 120:
        content = f'{content[:120]}...'
      title_part = f' | {title}' if title else ''
      url_part = f' | {event.url}' if event.url else ''
      lines.append(
        f'{idx}. [{event.source}/{event.event_type}]{title_part} | {content}{url_part}'
      )
    return '\n'.join(lines)

  def _extract_message_text(self, content: str | list[dict]) -> str:
    if isinstance(content, str):
      return content
    chunks: list[str] = []
    for item in content:
      if isinstance(item, dict) and item.get('type') == 'text':
        text = item.get('text')
        if isinstance(text, str):
          chunks.append(text)
    return '\n'.join(chunks)

  def _extract_json(self, text: str) -> dict:
    stripped = text.strip()
    stripped = re.sub(r'^```(?:json)?\s*', '', stripped)
    stripped = re.sub(r'\s*```$', '', stripped)

    try:
      payload = json.loads(stripped)
      if isinstance(payload, dict):
        return payload
    except json.JSONDecodeError:
      pass

    start = stripped.find('{')
    end = stripped.rfind('}')
    if start < 0 or end <= start:
      raise ValueError('llm response is not valid json object')

    payload = json.loads(stripped[start : end + 1])
    if not isinstance(payload, dict):
      raise ValueError('llm response json is not object')
    return payload

  def _chat_json(self, *, system_prompt: str, user_prompt: str) -> dict:
    if not self.api_key:
      raise ValueError('missing llm api key')
    if not self.model:
      raise ValueError('missing llm model')

    endpoint = f'{self.api_base}/chat/completions'
    response = httpx.post(
      endpoint,
      headers={
        'Authorization': f'Bearer {self.api_key}',
        'Content-Type': 'application/json',
      },
      json={
        'model': self.model,
        'temperature': 0.2,
        'response_format': {'type': 'json_object'},
        'messages': [
          {'role': 'system', 'content': system_prompt},
          {'role': 'user', 'content': user_prompt},
        ],
      },
      timeout=self.timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json()
    content = payload['choices'][0]['message']['content']
    text = self._extract_message_text(content)
    return self._extract_json(text)

  def _normalize_list(self, data: object, *, limit: int) -> list[str]:
    if not isinstance(data, list):
      return []
    values: list[str] = []
    for item in data:
      text = str(item).strip()
      if text:
        values.append(text)
      if len(values) >= limit:
        break
    return values

  def generate_plan(self, target_date: date, events: list[Event]) -> DailyPlanPayload:
    event_digest = self._event_digest(events)
    result = self._chat_json(
      system_prompt=(
        '你是个人工作系统的晨间规划助手。'
        '你只输出 JSON，不要输出任何解释。'
      ),
      user_prompt=(
        f'日期：{target_date.isoformat()}\n'
        '请根据输入事件生成晨间计划，字段必须为：'
        'top_goals(3条字符串)、focus_blocks(3条字符串)、risks(3条字符串)、summary(1条字符串)。\n'
        '保持结果可执行、简洁、结果导向。\n'
        f'输入事件：\n{event_digest}'
      ),
    )

    top_goals = self._normalize_list(result.get('top_goals'), limit=3)
    focus_blocks = self._normalize_list(result.get('focus_blocks'), limit=3)
    risks = self._normalize_list(result.get('risks'), limit=3)
    summary = str(result.get('summary', '')).strip()
    if not summary:
      raise ValueError('llm plan summary is empty')

    fallback = MockLLMService().generate_plan(target_date, events)
    if len(top_goals) < 3:
      top_goals.extend(fallback.top_goals[: 3 - len(top_goals)])
    if len(focus_blocks) < 3:
      focus_blocks.extend(fallback.focus_blocks[: 3 - len(focus_blocks)])
    if len(risks) < 3:
      risks.extend(fallback.risks[: 3 - len(risks)])

    return DailyPlanPayload(
      date=target_date,
      top_goals=top_goals,
      focus_blocks=focus_blocks,
      risks=risks,
      summary=summary,
    )

  def generate_review(self, target_date: date, events: list[Event]) -> DailyReviewPayload:
    event_digest = self._event_digest(events)
    result = self._chat_json(
      system_prompt=(
        '你是个人工作系统的晚间复盘助手。'
        '你只输出 JSON，不要输出任何解释。'
      ),
      user_prompt=(
        f'日期：{target_date.isoformat()}\n'
        '请根据输入事件生成晚间复盘，字段必须为：'
        'outcomes(2条以上字符串)、unfinished(2条以上字符串)、'
        'cognition_delta(3条字符串，格式为“旧判断 -> 新判断”)、'
        'tomorrow_first_step(1条字符串)、summary(1条字符串)。\n'
        '保持结果具体、可执行。\n'
        f'输入事件：\n{event_digest}'
      ),
    )

    outcomes = self._normalize_list(result.get('outcomes'), limit=5)
    unfinished = self._normalize_list(result.get('unfinished'), limit=5)
    cognition_delta = self._normalize_list(result.get('cognition_delta'), limit=3)
    tomorrow_first_step = str(result.get('tomorrow_first_step', '')).strip()
    summary = str(result.get('summary', '')).strip()

    fallback = MockLLMService().generate_review(target_date, events)
    if len(outcomes) < 2:
      outcomes.extend(fallback.outcomes[: 2 - len(outcomes)])
    if len(unfinished) < 2:
      unfinished.extend(fallback.unfinished[: 2 - len(unfinished)])
    if len(cognition_delta) < 3:
      cognition_delta.extend(fallback.cognition_delta[: 3 - len(cognition_delta)])
    if not tomorrow_first_step:
      tomorrow_first_step = fallback.tomorrow_first_step
    if not summary:
      summary = fallback.summary

    return DailyReviewPayload(
      date=target_date,
      outcomes=outcomes,
      unfinished=unfinished,
      cognition_delta=cognition_delta,
      tomorrow_first_step=tomorrow_first_step,
      summary=summary,
    )


def get_default_llm_service() -> LLMService:
  return MockLLMService()
