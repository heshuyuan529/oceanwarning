"""
LightGBM 分类模型加载与推理。

加载 T{h}_classifier_{domain}.joblib（含 model/categories/columns/calibration），
对特征 DataFrame 推理输出校准后的概率 p_raw。
"""

import joblib
import numpy as np
from pathlib import Path
from .feature_engineering import build_features, transform, calapply, FIELD_MAP, CAT

# 模型文件根目录（海智航盾双任务算法/models）
_ALGO_ROOT = Path(__file__).resolve().parents[2] / '海智航盾双任务算法'
_MODELS_DIR = _ALGO_ROOT / 'models'

# 提前期映射：'7天' → 7, '3天' → 3, '1天' → 1
HORIZON_DAYS = {'7天': 7, '3天': 3, '1天': 1}


def _load_classifier(h: int, domain: str = 'mixed') -> dict:
    """加载分类模型 bundle。

    domain: 'real'（基本特征）或 'mixed'（含节点事件特征）
    返回 {model, categories, columns, calibration}
    """
    path = _MODELS_DIR / f'T{h}_classifier_{domain}.joblib'
    if not path.exists():
        raise FileNotFoundError(f'模型文件不存在：{path}')
    return joblib.load(path)


def _load_manifest():
    """加载实验清单（含 priority_mixed_weight）。"""
    import json
    manifest_path = _ALGO_ROOT / 'results' / 'experiment_manifest.json'
    if not manifest_path.exists():
        raise FileNotFoundError(f'实验清单不存在：{manifest_path}')
    return json.loads(manifest_path.read_text(encoding='utf-8'))


def predict_p_raw(order_df, horizon: str) -> float:
    """对单行订单 DataFrame 推理，返回分类模型校准后的概率 p_raw。

    流程：
    1. build_features 构造特征
    2. 加载 real + mixed 两个域的分类模型
    3. 各自 predict_proba → calapply 校准
    4. 加权融合：raw = (1-w)*real + w*mixed
    """
    h = HORIZON_DAYS[horizon]
    x, real, snap = build_features(order_df, h)

    manifest = _load_manifest()
    w = manifest[str(h)]['priority_mixed_weight']

    preds = {}
    for domain, cols in [('real', real), ('mixed', list(x.columns))]:
        bundle = _load_classifier(h, domain)
        model = bundle['model']
        categories = bundle['categories']
        calibration = bundle['calibration']

        xt = transform(x[cols], categories)
        raw_proba = model.predict_proba(xt)[:, 1]
        calibrated = calapply(raw_proba, calibration)
        preds[domain] = calibrated[0]  # 单行取第一个

    # 加权融合
    p_raw = (1 - w) * preds['real'] + w * preds['mixed']
    return float(p_raw)
