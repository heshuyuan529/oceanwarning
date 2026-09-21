"""
特征工程（复用 pipeline.py 的 build_features + transform）

从订单 JSON 构造 LightGBM 分类模型输入特征。
字段映射：API 英文键 → pipeline 中文列名。
"""

import numpy as np
import pandas as pd
from pathlib import Path

# pipeline.py 中的字段映射常量
CAT = {
    '箱型': 'container',
    '始发港': 'origin',
    '目的港': 'destination',
    '出口国家': 'country',
    '成交方式': 'trade',
}

SIM = {
    'booking': '节点4_发起订舱时间',
    'allocation': '节点5_物流分舱时间',
    'so': '节点6_下货纸SO时间',
    'documents': '节点7_截单时间',
    'pickup': '节点8_提箱时间',
    'return': '节点9_还箱时间',
    'customs': '节点10_报关申报时间',
    'gate': '节点11_集港时间',
    'release': '节点12_放行时间',
}

# API 英文键 → pipeline 中文列名
FIELD_MAP = {
    'etd': '节点13_ETD',
    'container_type': '箱型',
    'origin': '始发港',
    'destination': '目的港',
    'country': '出口国家',
    'trade_type': '成交方式',
    'planned_production_date': '预计生产日期',
    'actual_production_date': '实际生产日期',
    'actual_payment_date': '实际预付款日期',
    'procurement_date': '节点1_录单_采购日期(Proxy)',
}


def order_to_dataframe(order: dict) -> pd.DataFrame:
    """把 API 订单 JSON 转为 pipeline 期望的 DataFrame（单行）。"""
    rows = []
    for i, row in enumerate(order.get('orders', [order])):
        r = {}
        for en, cn in FIELD_MAP.items():
            r[cn] = row.get(en, None)
        # SIM 节点
        for key, col in SIM.items():
            r[col] = row.get('milestones', {}).get(key, None)
        r['_row_idx'] = i
        rows.append(r)
    df = pd.DataFrame(rows)
    # 日期解析
    date_cols = ['节点13_ETD', '预计生产日期', '实际生产日期', '实际预付款日期',
                 '节点1_录单_采购日期(Proxy)'] + list(SIM.values())
    for c in date_cols:
        if c in df.columns:
            df[c] = pd.to_datetime(df[c], errors='coerce')
    return df


def build_features(d: pd.DataFrame, h: int):
    """移植自 pipeline.py build_features（L18-35）。

    返回 (x, real_features, snapshot)
    """
    snap = d['节点13_ETD'].dt.normalize() - pd.Timedelta(days=h)
    x = pd.DataFrame(index=d.index)

    for c, k in CAT.items():
        x[k] = d[c].fillna('UNKNOWN').astype(str)
    x['route'] = x['origin'] + '>' + x['destination']
    x['etd_weekday'] = d['节点13_ETD'].dt.weekday

    plan = d['预计生产日期'].where(
        d['预计生产日期'].between('2024-01-01', d['节点13_ETD'] + pd.Timedelta(days=365))
    )
    x['planned_production_lead'] = (
        d['节点13_ETD'].dt.normalize() - plan.dt.normalize()
    ).dt.days

    for key, col in [('production', '实际生产日期'),
                     ('payment', '实际预付款日期'),
                     ('procurement', '节点1_录单_采购日期(Proxy)')]:
        event = d[col].where(d[col] >= '2024-01-01')
        visible = event.notna() & (event.dt.normalize() + pd.Timedelta(days=1) <= snap)
        x[key + '_observed'] = visible.astype(int)
        x[key + '_age'] = (snap - event.where(visible).dt.normalize()).dt.days
        if key == 'production':
            x['production_deviation'] = (
                event.where(visible).dt.normalize() - plan.dt.normalize()
            ).dt.days
            x['production_pending_overdue'] = np.where(
                visible, 0,
                (snap - plan.dt.normalize()).dt.days.clip(lower=0)
            )

    real = list(x.columns)

    for key, col in SIM.items():
        e = d[col]
        v = e.notna() & (e.dt.normalize() + pd.Timedelta(days=1) <= snap)
        x[key + '_observed'] = v.astype(int)
        x[key + '_age'] = (snap - e.where(v)).dt.total_seconds() / 86400

    for c in x.select_dtypes('number'):
        x[c] = x[c].clip(-180, 365)

    return x, real, snap


def transform(x: pd.DataFrame, categories: dict) -> pd.DataFrame:
    """移植自 pipeline.py transform（L53-56）。"""
    z = x.copy()
    for c, v in categories.items():
        z[c] = pd.Categorical(z[c].where(z[c].isin(v)), categories=v)
    return z


def calapply(p, ab):
    """校准应用（移植自 pipeline.py calapply）。"""
    from scipy.special import expit, logit
    z = logit(np.clip(p, 1e-6, 1 - 1e-6))
    return expit(ab[0] * z + ab[1])
