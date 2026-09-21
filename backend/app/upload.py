"""
Excel/CSV 文件上传解析器

把用户上传的订单表格转为 List[OrderInput]，复用 feature_engineering.FIELD_MAP
的反向映射（中文列名 → API 英文键）。

支持两种列名：
  1. 中文业务列名（与 pipeline.py 一致）：
     节点13_ETD / 箱型 / 委发港 / 目的港 / 出口国家 / 成交方式 /
     预计生产日期 / 实际生产日期 / 实际预付款日期 / 节点1_录单_采购日期(Proxy) /
     节点4_发起订舱时间 ... 节点12_放行时间
  2. 英文 API 键（与 OrderInput 一致）：
     etd / container_type / origin / destination / country / trade_type /
     planned_production_date / planned_payment_date / actual_production_date /
     actual_payment_date / procurement_date / booking ... release

若两种都有，以英文键为准；若都无，取默认值 'UNKNOWN' 或 None。
"""

import io
import pandas as pd
from typing import List

from .schemas import OrderInput
from .feature_engineering import FIELD_MAP, SIM


# 中文列名 → 英文 API 键（基于 FIELD_MAP 反向 + SIM）
CN_TO_EN = {cn: en for en, cn in FIELD_MAP.items()}
CN_TO_EN.update({sim_en: sim_en_key for sim_en_key, sim_cn in SIM.items() for sim_en in [sim_cn]})

# 加上 planned_payment_date（pipeline.py 中无对应中文列，用英文键识别）
# 用户表中若有"预计预付款日期"列也会被识别
CN_TO_EN['预计预付款日期'] = 'planned_payment_date'


def _read_table(filename: str, content: bytes) -> pd.DataFrame:
    """根据扩展名读取 Excel 或 CSV 为 DataFrame。"""
    name = filename.lower()
    if name.endswith('.xlsx') or name.endswith('.xls'):
        return pd.read_excel(io.BytesIO(content))
    if name.endswith('.csv'):
        # 试 UTF-8，失败回退 GBK（Windows 中文 Excel 默认编码）
        try:
            return pd.read_csv(io.BytesIO(content), encoding='utf-8')
        except UnicodeDecodeError:
            return pd.read_csv(io.BytesIO(content), encoding='gbk')
    raise ValueError(f'不支持的文件类型：{filename}（仅支持 .xlsx / .xls / .csv）')


def _normalize_value(v):
    """把单元格值规整为 OrderInput 期望的字符串或 None。"""
    if v is None:
        return None
    if isinstance(v, float) and pd.isna(v):
        return None
    if isinstance(v, pd.Timestamp):
        return v.strftime('%Y-%m-%d')
    s = str(v).strip()
    if s == '' or s.lower() in ('nan', 'none', 'null'):
        return None
    # 日期形如 2026-09-15 16:30:00 → 截到日
    if ' ' in s and s[0:4].isdigit():
        s = s.split(' ')[0]
    return s


def dataframe_to_orders(df: pd.DataFrame) -> List[OrderInput]:
    """把 DataFrame 行逐一映射为 OrderInput。"""
    # 建立列名 → 英文键 的查表（同时支持中文列名和英文键名）
    col_map = {}
    for col in df.columns:
        key = col.strip()
        if key in CN_TO_EN:
            col_map[col] = CN_TO_EN[key]
        elif key in FIELD_MAP or key in SIM or key == 'planned_payment_date':
            # 英文键直接命中
            col_map[col] = key
        # 否则忽略该列

    # ETD 必填检查
    if 'etd' not in col_map.values():
        raise ValueError(
            "缺少 ETD 列。请在表中加入列名为 '节点13_ETD' 或 'etd' 的列，"
            "并填入 ISO 日期（如 2026-09-15）。"
        )

    orders: List[OrderInput] = []
    for _, row in df.iterrows():
        data = {en: _normalize_value(row[col]) for col, en in col_map.items()}
        # etd 必填
        if not data.get('etd'):
            continue  # 跳过空行
        # SIM 节点缺省为 None（OrderInput 默认）
        order = OrderInput(**data)
        orders.append(order)
    return orders


def parse_upload(filename: str, content: bytes) -> List[OrderInput]:
    """对外入口：文件名 + 原始字节 → List[OrderInput]。"""
    df = _read_table(filename, content)
    if df.empty:
        raise ValueError('上传文件为空')
    return dataframe_to_orders(df)
