"""前后端一致性验证：调用 /api/predict，对比 6 票订单的 joint_state 与 shipments.ts 期望。"""

import json
import urllib.request

BASE = 'http://localhost:8000'

ORDERS = [
    # ① SH-2026-0712 (7天)
    dict(etd='2026-07-12', container_type='40HQ', origin='青岛', destination='鹿特丹',
         country='NL', trade_type='FOB',
         planned_production_date='2026-07-02', planned_payment_date='2026-06-28',
         actual_production_date=None, actual_payment_date=None,
         procurement_date='2026-06-20'),
    # ② SH-2026-0815 (7天)
    dict(etd='2026-08-22', container_type='40GP', origin='上海', destination='汉堡',
         country='DE', trade_type='FOB',
         planned_production_date='2026-08-10', planned_payment_date='2026-08-18',
         actual_production_date=None, actual_payment_date=None,
         procurement_date='2026-07-30'),
    # ③ SH-2026-0901 (3天)
    dict(etd='2026-09-08', container_type='40FR', origin='宁波', destination='洛杉矶',
         country='US', trade_type='CIF',
         planned_production_date='2026-08-28', planned_payment_date='2026-08-25',
         actual_production_date='2026-08-27', actual_payment_date='2026-08-24',
         procurement_date='2026-08-10'),
    # ④ SH-2026-0905 (3天，付款计划缺失)
    dict(etd='2026-09-12', container_type='20GP', origin='青岛', destination='釜山',
         country='KR', trade_type='FOB',
         planned_production_date='2026-09-03', planned_payment_date=None,
         actual_production_date='2026-09-06', actual_payment_date='2026-09-05',
         procurement_date='2026-08-25'),
    # ⑤ SH-2026-0910 (1天)
    dict(etd='2026-09-18', container_type='40HQ', origin='深圳', destination='长滩',
         country='US', trade_type='CIF',
         planned_production_date='2026-09-10', planned_payment_date='2026-09-08',
         actual_production_date='2026-09-12', actual_payment_date='2026-09-11',
         procurement_date='2026-08-30'),
    # ⑥ SH-2026-0908 (1天)
    dict(etd='2026-09-15', container_type='40OT', origin='天津', destination='墨尔本',
         country='AU', trade_type='CIF',
         planned_production_date='2026-09-20', planned_payment_date='2026-09-16',
         actual_production_date=None, actual_payment_date=None,
         procurement_date='2026-09-01'),
]

# shipments.ts 中硬编码的联合状态（应与后端计算严格一致）
EXPECTED = [
    ('SH-2026-0712', '已到期未观测', '已到期未观测'),
    ('SH-2026-0815', '已到期未观测', '未到期未观测'),
    ('SH-2026-0901', '已完成未逾期', '已完成未逾期'),
    ('SH-2026-0905', '已完成逾期',   '计划未知'),
    ('SH-2026-0910', '已完成逾期',   '已完成逾期'),
    ('SH-2026-0908', '未到期未观测', '未到期未观测'),
]
HORIZONS = ['7天', '7天', '3天', '3天', '1天', '1天']

# 按 horizon 分桶批量调用
by_horizon = {}
for i, h in enumerate(HORIZONS):
    by_horizon.setdefault(h, []).append(i)

results = {}
for h, idxs in by_horizon.items():
    req = dict(horizon=h, orders=[ORDERS[i] for i in idxs],
               options=dict(standalone=True, interventions=True))
    body = json.dumps(req, ensure_ascii=False).encode('utf-8')
    r = urllib.request.Request(f'{BASE}/api/predict', data=body,
                                headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(r, timeout=30) as resp:
        arr = json.loads(resp.read().decode('utf-8'))
    for j, idx in enumerate(idxs):
        results[idx] = arr[j]

print('===== 一致性验证结果 =====')
all_pass = True
for i in range(6):
    r = results[i]
    key, exp_prod, exp_pay = EXPECTED[i]
    prod_ok = r['joint_state']['production'] == exp_prod
    pay_ok = r['joint_state']['payment'] == exp_pay
    passed = prod_ok and pay_ok
    all_pass = all_pass and passed
    status = 'PASS' if passed else 'FAIL'
    print(f"[{status}] {key}  prod={r['joint_state']['production']} (exp={exp_prod},{prod_ok})  "
          f"pay={r['joint_state']['payment']} (exp={exp_pay},{pay_ok})  "
          f"p_raw={r['p_raw']:.3f}  p*={r['score']['p_star']:.3f}  "
          f"q={r['score']['q']:.3f}  LR={r['score']['LR']:.3f}  state={r['score']['state_id']}")
    if r.get('interventions'):
        print(f"    interventions: {len(r['interventions'])} 个候选")
        for iv in r['interventions']:
            print(f"      alt=({iv['alternative']['production']},{iv['alternative']['payment']})  "
                  f"baseline p*={iv['baseline']['p_star']:.3f}  intervened p*={iv['intervened']['p_star']:.3f}  "
                  f"Δ={iv['p_star_change']:+.3f}")

print()
print('===== 全部 PASS：后端联合状态与前端 shipments.ts 完全一致 =====' if all_pass
      else '===== 存在 FAIL =====')
