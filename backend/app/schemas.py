"""API 请求/响应 Pydantic 模型。"""

from pydantic import BaseModel, Field
from typing import Optional, List


class MilestoneInput(BaseModel):
    """单个里程碑证据输入（生产或付款）。"""
    planned_date: Optional[str] = None
    actual_date: Optional[str] = None
    source: str = 'unknown'


class OrderInput(BaseModel):
    """单票订单输入。"""
    etd: str  # 最初约定 ETD（必填）
    container_type: str = 'UNKNOWN'
    origin: str = 'UNKNOWN'
    destination: str = 'UNKNOWN'
    country: str = 'UNKNOWN'
    trade_type: str = 'UNKNOWN'
    planned_production_date: Optional[str] = None
    planned_payment_date: Optional[str] = None
    actual_production_date: Optional[str] = None
    actual_payment_date: Optional[str] = None
    procurement_date: Optional[str] = None
    # SIM 节点（9 个）
    booking: Optional[str] = None
    allocation: Optional[str] = None
    so: Optional[str] = None
    documents: Optional[str] = None
    pickup: Optional[str] = None
    return_: Optional[str] = Field(None, alias='return')
    customs: Optional[str] = None
    gate: Optional[str] = None
    release: Optional[str] = None


class PredictRequest(BaseModel):
    """预测请求。"""
    horizon: str  # '7天' | '3天' | '1天'
    orders: List[OrderInput]  # 支持批量
    options: dict = {}  # {standalone: true, interventions: true}


class PredictResponse(BaseModel):
    """单票预测结果。"""
    p_raw: float
    joint_state: dict
    score: dict  # ScoreTrace
    standalone: Optional[dict] = None
    interventions: Optional[List[dict]] = None
