---
title: 海智航盾风险预警 API
emoji: 🛡️
colorFrom: blue
colorTo: cyan
sdk: docker
app_port: 7860
pinned: false
---

# 海智航盾 OceanGuard AI

跨境物流晚开风险预警后端服务（FastAPI + LightGBM + 贝叶斯融合）。

- 健康检查：`GET /api/health`
- 单笔预测：`POST /api/predict`
- 批量预测：`POST /api/predict/upload`
