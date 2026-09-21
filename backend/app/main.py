"""
FastAPI 应用：风险预警后端 API。

端点：
  POST /api/predict  — 订单数据 → p_raw → 融合推断 → p*
  GET  /api/health   — 健康检查
  GET  /api/model/{horizon} — 融合模型元数据（供 W3 审计页）
"""

import datetime
from typing import Optional, List
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .engine import (
    JointState,
    ScoreInput,
    score_order,
    score_standalone_ml,
    compare_state_intervention,
)
from .data.fusion_models import (
    fusion_models,
    fusion_model_raw,
    get_fusion_model,
    horizons,
    fusion_graph,
)
from .model_loader import predict_p_raw
from .feature_engineering import order_to_dataframe
from .schemas import PredictRequest, PredictResponse, OrderInput
from .upload import parse_upload

app = FastAPI(title='风险预警 API', version='1.0.0')

# CORS：允许前端域名
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        'http://localhost:5173',
        'http://localhost:4173',
        'https://ocean-risk-warning-2026.netlify.app',
        'https://*.netlify.app',
    ],
    allow_methods=['GET', 'POST'],
    allow_headers=['*'],
)

# 有效日期范围（表3-7）
DATE_MIN = datetime.date(2024, 1, 1)
DATE_MAX = datetime.date(2027, 1, 1)


def compute_milestone_state(
    planned: Optional[str],
    actual: Optional[str],
    snapshot: Optional[datetime.datetime],
) -> str:
    """计算五状态（表3-7）。

    优先级：计划未知 > 已完成未逾期 > 已完成逾期 > 已到期未观测 > 未到期未观测
    """
    # 解析计划日期
    plan_date = None
    if planned:
        try:
            plan_date = datetime.datetime.fromisoformat(planned).date()
        except (ValueError, TypeError):
            plan_date = None

    # 计划未知：缺失或不在有效范围
    if plan_date is None or not (DATE_MIN <= plan_date <= DATE_MAX):
        return '计划未知'

    # 解析实际日期
    actual_date = None
    if actual:
        try:
            actual_date = datetime.datetime.fromisoformat(actual).date()
        except (ValueError, TypeError):
            actual_date = None

    # 实际记录可见性：实际日期存在且 <= 快照时点次日
    snap_date = snapshot.date() if snapshot else datetime.date.today()
    visible = actual_date is not None and actual_date <= snap_date + datetime.timedelta(days=1)

    if visible:
        if actual_date <= plan_date:
            return '已完成未逾期'
        else:
            return '已完成逾期'

    # 实际不可见：判断计划是否已到期
    if plan_date < snap_date:
        return '已到期未观测'
    else:
        return '未到期未观测'


def compute_joint_state(order: OrderInput, horizon: str) -> JointState:
    """从订单日期计算生产/付款联合状态 S。"""
    h = int(horizon.replace('天', ''))
    try:
        etd = datetime.datetime.fromisoformat(order.etd)
    except (ValueError, TypeError):
        raise HTTPException(400, f'ETD 日期格式无效：{order.etd}')
    snap = etd.replace(hour=0, minute=0, second=0, microsecond=0) - datetime.timedelta(days=h)

    prod_state = compute_milestone_state(
        order.planned_production_date, order.actual_production_date, snap
    )
    pay_state = compute_milestone_state(
        order.planned_payment_date,
        order.actual_payment_date,
        snap,
    )

    return JointState(production=prod_state, payment=pay_state)


@app.get('/api/health')
async def health():
    return {'status': 'ok', 'models_loaded': len(horizons)}


@app.post('/api/predict', response_model=list)
async def predict(req: PredictRequest):
    """批量预测：订单数据 → p_raw → 融合推断 → p*。"""
    return _predict_orders(req.horizon, req.orders, req.options)


@app.post('/api/predict/upload')
async def predict_upload(
    horizon: str = Form(...),
    file: UploadFile = File(...),
    standalone: bool = Form(True),
    interventions: bool = Form(False),
):
    """上传 Excel/CSV → 解析为订单 → 推理 p_raw → 融合 → p*。

    表格列名支持中文（与 pipeline.py 一致）或英文 API 键。
    ETD 列必填（中文列名 '节点13_ETD' 或英文 'etd'）。
    """
    if horizon not in horizons:
        raise HTTPException(400, f'提前期必须是 {horizons} 之一')

    content = await file.read()
    try:
        orders = parse_upload(file.filename, content)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f'文件解析失败：{e}')

    if not orders:
        raise HTTPException(400, '上传文件未解析出任何订单（请检查 ETD 列是否填值）')

    options = {'standalone': standalone, 'interventions': interventions}
    return _predict_orders(horizon, orders, options)


def _predict_orders(horizon: str, orders: List[OrderInput], options: dict) -> list:
    """共享的批量预测实现（被 JSON predict 与 upload 复用）。"""
    model = get_fusion_model(horizon)
    results = []

    for order in orders:
        # 1. 特征工程 + LightGBM 推理 → p_raw
        df = order_to_dataframe({'orders': [order.model_dump(by_alias=True)]})
        p_raw = predict_p_raw(df, horizon)

        # 2. 计算联合状态 S
        joint_state = compute_joint_state(order, horizon)

        # 3. 融合推断
        input = ScoreInput(p_raw=p_raw, state=joint_state)
        trace = score_order(model, input)

        result = {
            'order': order.model_dump(by_alias=True),
            'p_raw': p_raw,
            'joint_state': {
                'production': joint_state.production,
                'payment': joint_state.payment,
            },
            'score': _trace_to_dict(trace),
        }

        # 4. 独立 ML 对照
        if options.get('standalone', True):
            sa = score_standalone_ml(model, p_raw)
            result['standalone'] = {'q': sa['q'], 'p_star': sa['p_star']}

        # 5. 情景对比
        if options.get('interventions', False):
            interventions = _compute_interventions(model, input, joint_state)
            result['interventions'] = interventions

        results.append(result)

    return results


@app.get('/api/model/{horizon}')
async def model_info(horizon: str):
    """返回融合模型元数据（供 W3 审计页）。"""
    if horizon not in horizons:
        raise HTTPException(404, f'提前期 {horizon} 不存在')

    raw = fusion_model_raw[horizon]
    compiled = fusion_models[horizon]

    return {
        'horizon': horizon,
        'ml_model_version': raw.ml_model_version,
        'condition_table_version': raw.condition_table_version,
        'virtual_evidence_version': raw.virtual_evidence_version,
        'fitted_orders': raw.fitted_orders,
        'first_calibration': {
            'slope': raw.first_calibration.slope,
            'intercept': raw.first_calibration.intercept,
            'fitted_count': raw.first_calibration.fitted_count,
        },
        'second_calibration': {
            method: {
                'slope': raw.second_calibration[method].slope,
                'intercept': raw.second_calibration[method].intercept,
                'fitted_count': raw.second_calibration[method].fitted_count,
            }
            for method in ['conditional', 'pooled']
        },
        'standalone_second_calibration': {
            'slope': raw.standalone_second_calibration.slope,
            'intercept': raw.standalone_second_calibration.intercept,
            'fitted_count': raw.standalone_second_calibration.fitted_count,
        },
        'theta_pooled': compiled.theta_pooled,
        'bins': [
            {
                'id': b.id,
                'label': b.label,
                'lower': b.lower,
                'upper': b.upper,
                'theta': b.theta,
                'pi': b.pi,
                'total': b.total,
            }
            for b in compiled.bins
        ],
        'states': [
            {'id': s.id, 'label': s.label,
             'production': s.production, 'payment': s.payment}
            for s in raw.states
        ],
        'fusion_graph': fusion_graph,
    }


def _trace_to_dict(trace) -> dict:
    """把 ScoreTrace dataclass 转为 dict。"""
    return {
        'horizon': trace.horizon,
        'method': trace.method,
        'method_label': trace.method_label,
        'p_raw': trace.p_raw,
        'q': trace.q,
        'bin_id': trace.bin_id,
        'bin_label': trace.bin_label,
        'state_id': trace.state_id,
        'state_label': trace.state_label,
        'is_other_state': trace.is_other_state,
        'pi': trace.pi,
        'lambda': trace.lambda_,
        'theta': trace.theta,
        'LR': trace.LR,
        'r': trace.r,
        'p_star': trace.p_star,
        'versions': trace.versions,
    }


def _compute_interventions(model, input: ScoreInput, current_state: JointState) -> list:
    """计算候选干预措施的情景对比。"""
    # 候选：把已到期未观测/计划未知 → 已完成未逾期
    interventions = []
    candidates = []

    if current_state.production in ('已到期未观测', '计划未知', '已完成逾期'):
        candidates.append(JointState(
            production='已完成未逾期',
            payment=current_state.payment,
        ))

    if current_state.payment in ('已到期未观测', '计划未知', '已完成逾期'):
        candidates.append(JointState(
            production=current_state.production,
            payment='已完成未逾期',
        ))

    # 双修复
    if current_state.production != '已完成未逾期' and current_state.payment != '已完成未逾期':
        candidates.append(JointState(
            production='已完成未逾期',
            payment='已完成未逾期',
        ))

    for alt in candidates:
        cmp = compare_state_intervention(model, input, alt)
        interventions.append({
            'alternative': {'production': alt.production, 'payment': alt.payment},
            'baseline': _trace_to_dict(cmp.baseline),
            'intervened': _trace_to_dict(cmp.intervened),
            'r_change': cmp.r_change,
            'p_star_change': cmp.p_star_change,
        })

    return interventions
