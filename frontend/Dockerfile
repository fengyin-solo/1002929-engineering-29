FROM node:20-alpine
WORKDIR /srv/web
# 按锁文件安装（npm ci），保证容器与本地装出同一份
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
