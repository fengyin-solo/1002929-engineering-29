FROM python:3.12-slim
WORKDIR /srv/app
# 按锁定版本安装，保证镜像与本地、与其它机器装出的依赖一致
COPY requirements.lock requirements.txt ./
RUN pip install --no-cache-dir -r requirements.lock
COPY . .
EXPOSE 8000
ENV SKIP_DEV_CONFIG=1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
