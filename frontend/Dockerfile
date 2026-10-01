FROM node:20-alpine
WORKDIR /srv/web
# 按锁文件做可复现安装（npm ci 要求 package.json 与 package-lock.json 一起拷入）
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
EXPOSE 5173
ENV FRONTEND_HOST=0.0.0.0
ENV SKIP_DEV_CONFIG=1
ENV SKIP_DEV_PREFLIGHT=1
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
