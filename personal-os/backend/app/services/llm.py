from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date

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


def get_default_llm_service() -> LLMService:
  return MockLLMService()
