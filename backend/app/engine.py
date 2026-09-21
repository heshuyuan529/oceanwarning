"""
晚开预警：机器学习 + 贝叶斯虚拟证据融合引擎（Python 移植版）

从 src/bn/engine.ts 逐函数移植，数学逻辑完全一致。
闭式后验（式3-15 ~ 式3-17）：
  第一次校准（式3-7）：q = σ(a·logit(p_raw) + b)
  虚拟证据（式3-15）  ：λ1 = q/π1，λ0 = (1−q)/π0
  似然比（式3-17）    ：LR = P(S|G=1,C) / P(S|G=0,C)
  闭式后验（式3-17）  ：r = q·LR / (1 − q + q·LR)
  第二次校准（式3-10）：p* = σ(A·logit(r) + B)

条件表由历史频数估计：
  总体表（式3-12）：θ(g,s)    = (n(g,s) + 0.5) / (n(g) + 0.5K)
  分区表（式3-13）：θ(c,g,s)  = (n(c,g,s) + 50·θ(g,s)) / (n(c,g) + 50)
  区间先验（式3-14）：π(c,g)  = (n(c,g) + 1) / (n(c) + 2)
"""

import math
from dataclasses import dataclass, field
from typing import Literal, Optional

# ===== 常量（newest.md 3.5.9 固定参数）=====

PROB_EPS = 1e-7
POOLED_SMOOTHING = 0.5
LOCAL_SHRINKAGE = 50
PRIOR_PSEUDOCOUNT = 1
SLOPE_BOUNDS = (0.001, 10.0)
INTERCEPT_BOUNDS = (-20.0, 20.0)

G_STATE_LABELS = ['未晚开', '晚开']

MILESTONE_STATES = [
    '已完成未逾期',
    '已完成逾期',
    '已到期未观测',
    '未到期未观测',
    '计划未知',
]

METHOD_LABELS = {
    'conditional': '条件融合',
    'pooled': '不分层融合',
}

OTHER_STATE_ID = 'OTHER'
OTHER_STATE_LABEL = '其他未见组合'

Horizon = Literal['7天', '3天', '1天']
FusionMethod = Literal['conditional', 'pooled']
MilestoneState = Literal[
    '已完成未逾期', '已完成逾期', '已到期未观测', '未到期未观测', '计划未知'
]


# ===== 数据结构 =====


@dataclass
class LogisticCalibration:
    slope: float
    intercept: float
    fitted_count: int


@dataclass
class JointState:
    production: str
    payment: str


@dataclass
class JointStateDef:
    id: str
    label: str
    production: str
    payment: str


@dataclass
class QuantileBin:
    id: str
    label: str
    lower: float
    upper: float
    counts: list  # [[n_0_0, n_0_1, ...], [n_1_0, n_1_1, ...]]
    voyage_count: Optional[int] = None


@dataclass
class FusionModel:
    horizon: str
    ml_model_version: str
    condition_table_version: str
    virtual_evidence_version: str
    states: list  # List[JointStateDef]
    pooled_counts: list  # [[...], [...]]
    bins: list  # List[QuantileBin]
    first_calibration: LogisticCalibration
    second_calibration: dict  # {'conditional': LogisticCalibration, 'pooled': LogisticCalibration}
    standalone_second_calibration: LogisticCalibration
    fitted_orders: int


@dataclass
class CompiledBin(QuantileBin):
    theta: list = field(default_factory=list)  # [[...], [...]]
    pi: list = field(default_factory=lambda: [0.0, 0.0])
    total: int = 0


@dataclass
class CompiledFusionModel:
    raw: FusionModel
    K: int
    state_index: dict  # {joint_key: index}
    theta_pooled: list  # [[...], [...]]
    bins: list  # List[CompiledBin]


@dataclass
class ScoreInput:
    p_raw: float
    state: JointState
    method: Optional[FusionMethod] = None


@dataclass
class ScoreTrace:
    horizon: str
    method: str
    method_label: str
    p_raw: float
    q: float
    bin_id: str
    bin_label: str
    state_id: str
    state_label: str
    is_other_state: bool
    pi: list  # [π0, π1]
    lambda_: list  # [λ0, λ1]
    theta: list  # [θ0s, θ1s]
    LR: float
    r: float
    p_star: float
    versions: dict


@dataclass
class StateInterventionResult:
    baseline: ScoreTrace
    intervened: ScoreTrace
    r_change: float
    p_star_change: float


# ===== 标量数学 =====


def sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def clip_prob(p: float) -> float:
    if not math.isfinite(p):
        return PROB_EPS
    return min(1.0 - PROB_EPS, max(PROB_EPS, p))


def logit(p: float) -> float:
    c = clip_prob(p)
    return math.log(c / (1.0 - c))


def calibrate(p: float, params: LogisticCalibration) -> float:
    return sigmoid(params.slope * logit(p) + params.intercept)


# ===== 频数估计（式3-12 ~ 式3-14）=====


def _sum(values: list) -> float:
    return sum(values)


def estimate_pooled_theta(counts: list, K: int) -> list:
    """总体条件频数表（式3-12）：θ(g,s) = (n(g,s) + 0.5) / (n(g) + 0.5K)"""
    result = []
    for g in range(2):
        ng = _sum(counts[g])
        denom = ng + POOLED_SMOOTHING * K
        result.append([(n + POOLED_SMOOTHING) / denom for n in counts[g]])
    return result


def estimate_bin_theta(bin_counts: list, theta_pooled: list, K: int) -> list:
    """分区条件频数表（式3-13）：θ(c,g,s) = (n(c,g,s) + 50·θ(g,s)) / (n(c,g) + 50)"""
    result = []
    for g in range(2):
        ncg = _sum(bin_counts[g])
        denom = ncg + LOCAL_SHRINKAGE
        result.append(
            [(n + LOCAL_SHRINKAGE * theta_pooled[g][s]) / denom for s, n in enumerate(bin_counts[g])]
        )
    return result


def estimate_bin_priors(bin_counts: list) -> list:
    """区间类别先验（式3-14）：π(c,g) = (n(c,g) + 1) / (n(c) + 2)"""
    n0 = _sum(bin_counts[0])
    n1 = _sum(bin_counts[1])
    denom = n0 + n1 + 2 * PRIOR_PSEUDOCOUNT
    return [(n0 + PRIOR_PSEUDOCOUNT) / denom, (n1 + PRIOR_PSEUDOCOUNT) / denom]


def joint_state_key(state: JointState) -> str:
    return f"{state.production}|{state.payment}"


def compile_model(raw: FusionModel) -> CompiledFusionModel:
    """编译模型：校验并在原始频数上完成 θ / π 估计。"""
    K = len(raw.states)
    state_index = {}
    for i, s in enumerate(raw.states):
        if s.id != OTHER_STATE_ID:
            state_index[joint_state_key(s)] = i

    theta_pooled = estimate_pooled_theta(raw.pooled_counts, K)
    bins = []
    for b in raw.bins:
        compiled = CompiledBin(
            id=b.id,
            label=b.label,
            lower=b.lower,
            upper=b.upper,
            counts=b.counts,
            voyage_count=b.voyage_count,
            theta=estimate_bin_theta(b.counts, theta_pooled, K),
            pi=estimate_bin_priors(b.counts),
            total=int(_sum(b.counts[0]) + _sum(b.counts[1])),
        )
        bins.append(compiled)

    return CompiledFusionModel(
        raw=raw, K=K, state_index=state_index, theta_pooled=theta_pooled, bins=bins
    )


# ===== 推断（式3-15 ~ 式3-17）=====


def find_bin(model: CompiledFusionModel, q: float) -> CompiledBin:
    bins = model.bins
    for i, b in enumerate(bins):
        upper_ok = q <= b.upper if i == len(bins) - 1 else q < b.upper
        if q >= b.lower and upper_ok:
            return b
    raise ValueError(f"q={q} 落在任何分位区间之外，区间切点配置错误")


def find_state_index(model: CompiledFusionModel, state: JointState):
    """联合状态定位；拟合期未见组合归入"其他"状态。"""
    key = joint_state_key(state)
    known = model.state_index.get(key)
    if known is not None:
        return known, False
    other_idx = None
    for i, s in enumerate(model.raw.states):
        if s.id == OTHER_STATE_ID:
            other_idx = i
            break
    if other_idx is None:
        raise ValueError('条件表缺少"其他"状态')
    return other_idx, True


def virtual_evidence_weights(q: float, pi: list) -> list:
    """虚拟证据权重（式3-15）：λ1 = q/π1，λ0 = (1−q)/π0"""
    return [(1 - q) / pi[0], q / pi[1]]


def likelihood_ratio(theta1s: float, theta0s: float) -> float:
    """状态似然比 LR = P(S|G=1,C) / P(S|G=0,C)（式3-17）"""
    return theta1s / theta0s


def fuse(q: float, LR: float) -> float:
    """闭式后验（式3-17）：r = q·LR / (1 − q + q·LR)"""
    supported = q * LR
    return supported / (1 - q + supported)


def score_order(model: CompiledFusionModel, input: ScoreInput) -> ScoreTrace:
    """单订单融合推断：p_raw → q → λ → LR → r → p*"""
    method = input.method if input.method is not None else 'pooled'

    # 第一次校准
    q = calibrate(input.p_raw, model.raw.first_calibration)

    # 定位分区 C 与联合状态 S
    bin = find_bin(model, q)
    s_idx, is_other = find_state_index(model, input.state)

    # 虚拟证据（先验抵消）
    lambda_ = virtual_evidence_weights(q, bin.pi)

    # 条件似然
    table = bin.theta if method == 'conditional' else model.theta_pooled
    theta0s = table[0][s_idx]
    theta1s = table[1][s_idx]
    LR = likelihood_ratio(theta1s, theta0s)

    # 闭式后验 + 第二次校准
    r = fuse(q, LR)
    p_star = calibrate(r, model.raw.second_calibration[method])

    state_def = model.raw.states[s_idx]
    return ScoreTrace(
        horizon=model.raw.horizon,
        method=method,
        method_label=METHOD_LABELS[method],
        p_raw=input.p_raw,
        q=q,
        bin_id=bin.id,
        bin_label=bin.label,
        state_id=state_def.id,
        state_label=state_def.label,
        is_other_state=is_other,
        pi=list(bin.pi),
        lambda_=lambda_,
        theta=[theta0s, theta1s],
        LR=LR,
        r=r,
        p_star=p_star,
        versions={
            'mlModel': model.raw.ml_model_version,
            'conditionTable': model.raw.condition_table_version,
            'virtualEvidence': model.raw.virtual_evidence_version,
        },
    )


def score_standalone_ml(model: CompiledFusionModel, p_raw: float) -> dict:
    """独立 ML 对照：不经业务状态融合，q 直接进入第二次校准。"""
    q = calibrate(p_raw, model.raw.first_calibration)
    return {'q': q, 'p_star': calibrate(q, model.raw.standalone_second_calibration)}


def compare_state_intervention(
    model: CompiledFusionModel, input: ScoreInput, alternative: JointState
) -> StateInterventionResult:
    """措施情景对比：改变联合状态后重算 r 与 p*。"""
    baseline = score_order(model, input)
    intervened_input = ScoreInput(
        p_raw=input.p_raw, state=alternative, method=input.method
    )
    intervened = score_order(model, intervened_input)
    return StateInterventionResult(
        baseline=baseline,
        intervened=intervened,
        r_change=intervened.r - baseline.r,
        p_star_change=intervened.p_star - baseline.p_star,
    )


# ===== 校验（对应 3.8.4 数值核验）=====

CHECK_EPS = 1e-9


def validate_model(raw: FusionModel) -> dict:
    """模型结构与频数校验。"""
    errors = []
    K = len(raw.states)

    if raw.states[-1].id != OTHER_STATE_ID:
        errors.append('最后一个状态必须是 OTHER')
    if len(raw.pooled_counts[0]) != K or len(raw.pooled_counts[1]) != K:
        errors.append(f'总体计数维度应为 {K}')

    for i, b in enumerate(raw.bins):
        if len(b.counts[0]) != K or len(b.counts[1]) != K:
            errors.append(f'区间 {b.id} 计数维度应为 {K}')

    if raw.bins:
        for i in range(len(raw.bins)):
            lower = raw.bins[i].lower
            upper = raw.bins[i].upper
            if lower < 0 or upper > 1:
                errors.append(f'区间 {raw.bins[i].id} 超出 [0,1]')
            if i > 0 and abs(lower - raw.bins[i - 1].upper) > CHECK_EPS:
                errors.append(f'区间 {raw.bins[i - 1].id} 与 {raw.bins[i].id} 不连续')

    fc = raw.first_calibration
    if fc.slope <= 0 or fc.slope < SLOPE_BOUNDS[0] or fc.slope > SLOPE_BOUNDS[1]:
        errors.append(f'第一次校准斜率越界：{fc.slope}')
    if fc.intercept < INTERCEPT_BOUNDS[0] or fc.intercept > INTERCEPT_BOUNDS[1]:
        errors.append(f'第一次校准截距越界：{fc.intercept}')

    for method in ['conditional', 'pooled']:
        sc = raw.second_calibration[method]
        if sc.slope <= 0 or sc.slope < SLOPE_BOUNDS[0] or sc.slope > SLOPE_BOUNDS[1]:
            errors.append(f'{method} 第二次校准斜率越界：{sc.slope}')

    for g in range(2):
        s = _sum(raw.pooled_counts[g])
        if s <= 0:
            errors.append(f'G={g} 总体计数和为零')

    return {'ok': len(errors) == 0, 'errors': errors}
