"""
晚开预警融合模型定义（newest.md 3.5 节，图3-2 极简概率图）

从 src/data/network.ts 逐函数移植，数据与校准系数完全一致。

结构：
  C（q 的分位区间，观测）→ G（晚开二态）← S（生产付款联合状态，观测）
  V 是挂在 G 上的虚拟证据子节点（λ = q/π），不是实体节点
"""

import math
from typing import List
from ..engine import (
    LogisticCalibration,
    JointStateDef,
    QuantileBin,
    FusionModel,
    CompiledFusionModel,
    compile_model,
    validate_model,
    OTHER_STATE_ID,
    OTHER_STATE_LABEL,
)

# ===== 五状态编码（表3-7）=====

DONE_OK = '已完成未逾期'
DONE_LATE = '已完成逾期'
DUE_MISSING = '已到期未观测'
NOT_DUE = '未到期未观测'
PLAN_UNKNOWN = '计划未知'

# ===== 联合状态定义 =====

joint_states: List[JointStateDef] = [
    JointStateDef('AA', '生产已完成未逾期 + 付款已完成未逾期', DONE_OK, DONE_OK),
    JointStateDef('BA', '生产已完成逾期 + 付款已完成未逾期', DONE_LATE, DONE_OK),
    JointStateDef('BB', '生产已完成逾期 + 付款已完成逾期', DONE_LATE, DONE_LATE),
    JointStateDef('CA', '生产已到期未观测 + 付款已完成未逾期', DUE_MISSING, DONE_OK),
    JointStateDef('CC', '生产已到期未观测 + 付款已到期未观测', DUE_MISSING, DUE_MISSING),
    JointStateDef('CD', '生产已到期未观测 + 付款未到期未观测', DUE_MISSING, NOT_DUE),
    JointStateDef('DA', '生产未到期未观测 + 付款已完成未逾期', NOT_DUE, DONE_OK),
    JointStateDef('DD', '生产未到期未观测 + 付款未到期未观测', NOT_DUE, NOT_DUE),
    JointStateDef('AE', '生产已完成未逾期 + 付款计划未知', DONE_OK, PLAN_UNKNOWN),
    JointStateDef('EE', '生产计划未知 + 付款计划未知', PLAN_UNKNOWN, PLAN_UNKNOWN),
    JointStateDef(OTHER_STATE_ID, OTHER_STATE_LABEL, PLAN_UNKNOWN, PLAN_UNKNOWN),
]

# ===== 演示频数（主分布）=====

master_counts = [
    [12600, 1100, 250, 600, 180, 210, 2600, 4200, 700, 350, 150],
    [180, 170, 185, 190, 120, 75, 60, 95, 45, 55, 46],
]

horizon_targets = {
    '7天': {'fitted_orders': 24161, 'late': 1221, 'ml_model_version': 'LightGBM-R2-h7（演示）'},
    '3天': {'fitted_orders': 26040, 'late': 1364, 'ml_model_version': 'LightGBM-R3-h3（演示）'},
    '1天': {'fitted_orders': 26452, 'late': 1362, 'ml_model_version': 'LightGBM-R3-h1（演示）'},
}

# ===== 分位区间 =====

bin_cuts = [0.04, 0.07, 0.11, 0.18]

bin_weights = [
    [0.30, 0.25, 0.20, 0.15, 0.10],
    [0.05, 0.10, 0.20, 0.30, 0.35],
]


def scale_to_total(vec, target):
    """最大余数法：把整数向量按目标总量配平。"""
    current = sum(vec)
    exact = [v * target / current for v in vec]
    floored = [math.floor(v) for v in exact]
    remainder = target - sum(floored)
    order = sorted(
        range(len(exact)),
        key=lambda i: exact[i] - math.floor(exact[i]),
        reverse=True,
    )
    for i in order:
        if remainder <= 0:
            break
        floored[i] += 1
        remainder -= 1
    return floored


def split_to_bins(total, weights):
    """按固定权重把一条状态计数分配到 5 个区间（最大余数法）。"""
    exact = [w * total for w in weights]
    floored = [math.floor(v) for v in exact]
    remainder = total - sum(floored)
    order = sorted(
        range(len(exact)),
        key=lambda i: exact[i] - math.floor(exact[i]),
        reverse=True,
    )
    for i in order:
        if remainder <= 0:
            break
        floored[i] += 1
        remainder -= 1
    return floored


def build_bins(pooled):
    """构造一个提前期的 5 个分位区间频数 n(c,g,s)。"""
    n_bins = len(bin_cuts) + 1
    alloc_g0 = [split_to_bins(n, bin_weights[0]) for n in pooled[0]]
    alloc_g1 = [split_to_bins(n, bin_weights[1]) for n in pooled[1]]

    cuts = [0, *bin_cuts, 1]
    bins = []
    for b in range(n_bins):
        upper_bracket = ']' if b == n_bins - 1 else ')'
        bins.append(
            QuantileBin(
                id=f'C{b + 1}',
                label=f'C{b + 1}（q ∈ [{cuts[b]}, {cuts[b + 1]}{upper_bracket}）',
                lower=cuts[b],
                upper=cuts[b + 1],
                counts=[
                    [alloc_g0[row][b] for row in range(len(pooled[0]))],
                    [alloc_g1[row][b] for row in range(len(pooled[1]))],
                ],
            )
        )
    return bins


# ===== 校准系数 =====

first_calibrations = {
    '7天': LogisticCalibration(0.583158, -0.776995, 30770),
    '3天': LogisticCalibration(0.498759, -0.783312, 31711),
    '1天': LogisticCalibration(0.551532, -0.707721, 31966),
}

second_calibrations = {
    '7天': {
        'standalone': LogisticCalibration(1.102037, -0.470482, 9918),
        'conditional': LogisticCalibration(0.609656, -1.406314, 9918),
        'pooled': LogisticCalibration(0.887520, -0.959661, 9918),
    },
    '3天': {
        'standalone': LogisticCalibration(1.326866, -0.064606, 10907),
        'conditional': LogisticCalibration(0.814227, -1.028505, 10907),
        'pooled': LogisticCalibration(1.060122, -0.655236, 10907),
    },
    '1天': {
        'standalone': LogisticCalibration(1.333462, 0.031148, 11176),
        'conditional': LogisticCalibration(0.902453, -0.763927, 11176),
        'pooled': LogisticCalibration(1.014233, -0.604820, 11176),
    },
}

# ===== 模型装配 =====

horizons = ['7天', '3天', '1天']


def build_raw_model(h: str) -> FusionModel:
    target = horizon_targets[h]
    pooled_counts = [
        scale_to_total(master_counts[0], target['fitted_orders'] - target['late']),
        scale_to_total(master_counts[1], target['late']),
    ]
    sc = second_calibrations[h]
    return FusionModel(
        horizon=h,
        ml_model_version=target['ml_model_version'],
        condition_table_version=f'CT-demo-{h}-v1',
        virtual_evidence_version='VE-demo-v1',
        states=joint_states,
        pooled_counts=pooled_counts,
        bins=build_bins(pooled_counts),
        first_calibration=first_calibrations[h],
        second_calibration={
            'conditional': sc['conditional'],
            'pooled': sc['pooled'],
        },
        standalone_second_calibration=sc['standalone'],
        fitted_orders=target['fitted_orders'],
    )


fusion_model_raw = {h: build_raw_model(h) for h in horizons}

fusion_models: dict = {h: compile_model(fusion_model_raw[h]) for h in horizons}


def get_fusion_model(horizon: str) -> CompiledFusionModel:
    return fusion_models[horizon]


# 模块加载即校验
for h in horizons:
    result = validate_model(fusion_model_raw[h])
    if not result['ok']:
        raise RuntimeError(f"[fusion_models.py] {h} 融合模型校验失败：{'; '.join(result['errors'])}")


# ===== 图3-2 概率图元数据 =====

fusion_graph = {
    'nodes': [
        {
            'id': 'C',
            'label': 'C 概率分位区间',
            'role': 'observed',
            'desc': '按拟合期 q 的 20/40/60/80 分位点划分（相同分位合并），观测节点',
        },
        {
            'id': 'S',
            'label': 'S 生产付款联合状态',
            'role': 'observed',
            'desc': '生产、付款五状态合并为联合状态（最多 25 种 + 其他），快照可见，观测节点',
        },
        {
            'id': 'G',
            'label': 'G 晚开结果',
            'role': 'target',
            'desc': 'ATD − 最初 ETD 严格超过 24 小时（式3-1），二态目标节点',
        },
        {
            'id': 'V',
            'label': 'V 虚拟证据',
            'role': 'virtual',
            'desc': '挂在 G 上的虚拟子节点（λ = q/π），不是实体节点',
        },
    ],
    'edges': [
        {'from': 'C', 'to': 'S', 'desc': '分位区间与联合状态的共同分布'},
        {'from': 'C', 'to': 'G', 'desc': 'q 的分位区间作为虚拟证据输入 G'},
        {'from': 'S', 'to': 'G', 'desc': '联合状态对晚开结果的似然贡献'},
        {'from': 'V', 'to': 'G', 'desc': '虚拟证据连接（λ 权重）', 'virtual': True},
    ],
}
