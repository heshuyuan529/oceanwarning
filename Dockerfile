FROM python:3.11-slim

WORKDIR /app

# 创建非 root 用户（Hugging Face Spaces 以 UID 1000 运行）
RUN useradd -m -u 1000 user

# 安装依赖
COPY --chown=user backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# 复制后端代码与模型文件（保持目录结构以匹配 model_loader 的路径解析）
COPY --chown=user backend/ ./backend/
COPY --chown=user 海智航盾双任务算法/ ./海智航盾双任务算法/

WORKDIR /app/backend

USER user

EXPOSE 7860

# HF Spaces 注入 PORT=7860；本地运行可通过 -e PORT=8000 覆盖
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
