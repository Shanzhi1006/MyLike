FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV TZ=Asia/Shanghai

RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources && \
    sed -i 's|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg gosu && \
    rm -rf /var/lib/apt/lists/*
COPY requirements.txt /app/
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple && \
    pip install --no-cache-dir --trusted-host mirrors.aliyun.com -r requirements.txt gunicorn
RUN addgroup --system app && adduser --system --ingroup app app

COPY --chown=app:app . /app/

RUN mkdir -p /app/media /app/data && chown app:app /app/media /app/data

EXPOSE 5000

CMD ["gunicorn", "--workers", "2", "--threads", "4", "--worker-class", "gthread", \
     "--timeout", "120", "--bind", "0.0.0.0:5000", "app:app"]
