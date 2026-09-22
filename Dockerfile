FROM python:3.11-slim

WORKDIR /app

# 安装依赖
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# 复制后端代码与模型文件（保持目录结构以匹配 model_loader 的路径解析）
COPY backend/ ./backend/
COPY 海智航盾双任务算法/ ./海智航盾双任务算法/

WORKDIR /app/backend

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
