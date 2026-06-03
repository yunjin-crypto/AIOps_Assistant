# ==========================================
# AIOps Assistant - Frontend Dockerfile
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# 安装依赖（利用 Docker 缓存层）
COPY package.json package-lock.json .
RUN npm ci

# 构建时注入 API 地址（NEXT_PUBLIC_* 在 build 时内联进 JS）
ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NODE_ENV=production

# 复制源码并构建
COPY . .
RUN npm run build

# ==========================================
# 生产运行阶段
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# 只复制运行所需文件
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .
COPY --from=builder /app/next.config.ts .
COPY --from=builder /app/postcss.config.mjs .
COPY --from=builder /app/tailwind.config.js .
COPY --from=builder /app/tsconfig.json .

EXPOSE 3000

CMD ["npm", "start"]
