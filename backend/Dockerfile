FROM python:3.12-slim
WORKDIR /srv/app
# 按冻结锁文件安装，保证容器与本地装出同一份
COPY requirements.lock ./
RUN pip install --no-cache-dir --no-deps -r requirements.lock
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
