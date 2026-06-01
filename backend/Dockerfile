# ==========================================
# AIOps Assistant - Backend Dockerfile
# ==========================================
FROM python:3.12-slim

WORKDIR /app

# 系统依赖 (faiss-cpu 运行需要 OpenMP)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY . .

# 在容器中创建数据目录 (代码中相对路径 ../../../data/ → /data/)
RUN mkdir -p /data/faiss /data/docs /data/workflows

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
