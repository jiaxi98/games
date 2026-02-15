from __future__ import annotations

from datetime import date

from app.api.deps import get_llm_service
from app.core.config import clear_settings_cache
from app.services.llm import MockLLMService, OpenAICompatibleLLMService


class _DummyResponse:
  def __init__(self, payload):
    self._payload = payload

  def raise_for_status(self):
    return None

  def json(self):
    return self._payload


def test_llm_service_selection_mock(monkeypatch):
  monkeypatch.setenv('PERSONAL_OS_LLM_MODE', 'mock')
  clear_settings_cache()
  service = get_llm_service()
  assert isinstance(service, MockLLMService)
  clear_settings_cache()


def test_llm_service_selection_openai_compatible(monkeypatch):
  monkeypatch.setenv('PERSONAL_OS_LLM_MODE', 'openai_compatible')
  monkeypatch.setenv('PERSONAL_OS_LLM_API_BASE', 'https://api.openai.com/v1')
  monkeypatch.setenv('PERSONAL_OS_LLM_API_KEY', 'test-key')
  monkeypatch.setenv('PERSONAL_OS_LLM_MODEL', 'gpt-4o-mini')
  clear_settings_cache()
  service = get_llm_service()
  assert isinstance(service, OpenAICompatibleLLMService)
  clear_settings_cache()


def test_openai_compatible_plan_generation(monkeypatch):
  def fake_post(*args, **kwargs):
    return _DummyResponse(
      {
        'choices': [
          {
            'message': {
              'content': '{"top_goals":["目标1","目标2","目标3"],'
              '"focus_blocks":["09:00-10:00","14:00-15:00","20:00-20:30"],'
              '"risks":["风险1","风险2","风险3"],'
              '"summary":"这是测试计划总结"}'
            }
          }
        ]
      }
    )

  monkeypatch.setattr('app.services.llm.httpx.post', fake_post)
  service = OpenAICompatibleLLMService(
    api_base='https://api.openai.com/v1',
    api_key='test-key',
    model='gpt-4o-mini',
  )
  payload = service.generate_plan(date(2026, 2, 15), [])
  assert payload.summary == '这是测试计划总结'
  assert payload.top_goals[0] == '目标1'


def test_openai_compatible_review_generation_with_markdown_json(monkeypatch):
  def fake_post(*args, **kwargs):
    return _DummyResponse(
      {
        'choices': [
          {
            'message': {
              'content': '```json\n'
              '{"outcomes":["结果1","结果2"],'
              '"unfinished":["未完成1","未完成2"],'
              '"cognition_delta":["旧1 -> 新1","旧2 -> 新2","旧3 -> 新3"],'
              '"tomorrow_first_step":"明早先做A",'
              '"summary":"复盘总结"}\n'
              '```'
            }
          }
        ]
      }
    )

  monkeypatch.setattr('app.services.llm.httpx.post', fake_post)
  service = OpenAICompatibleLLMService(
    api_base='https://api.openai.com/v1',
    api_key='test-key',
    model='gpt-4o-mini',
  )
  payload = service.generate_review(date(2026, 2, 15), [])
  assert payload.summary == '复盘总结'
  assert payload.tomorrow_first_step == '明早先做A'
