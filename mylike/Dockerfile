FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV TZ=Asia/Shanghai

ARG APT_MIRROR=mirrors.aliyun.com
ARG PIP_MIRROR=mirrors.aliyun.com/pypi/simple

RUN set -e; \
    if [ "$APT_MIRROR" != "deb.debian.org" ]; then \
      if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
        sed -i "s|security.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
      elif [ -f /etc/apt/sources.list ]; then \
        sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list; \
        sed -i "s|security.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list; \
      fi; \
    fi; \
    timeout 60 apt-get update || { \
      echo "WARN: APT mirror ${APT_MIRROR} failed (timeout or error), falling back to deb.debian.org"; \
      if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i "s|${APT_MIRROR}|deb.debian.org|g" /etc/apt/sources.list.d/debian.sources; \
      elif [ -f /etc/apt/sources.list ]; then \
        sed -i "s|${APT_MIRROR}|deb.debian.org|g" /etc/apt/sources.list; \
      fi; \
      apt-get update; \
    }; \
    apt-get install -y --no-install-recommends \
    ffmpeg gosu && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip config set global.index-url https://${PIP_MIRROR} && \
    pip install --no-cache-dir --trusted-host ${PIP_MIRROR%%/*} -r requirements.txt gunicorn

RUN addgroup --system app && adduser --system --ingroup app app

COPY --chown=app:app . /app/

RUN mkdir -p /app/media /app/data && chown app:app /app/media /app/data

EXPOSE 5000

CMD ["gunicorn", "--workers", "2", "--threads", "4", "--worker-class", "gthread", \
     "--timeout", "120", "--bind", "0.0.0.0:5000", "app:app"]