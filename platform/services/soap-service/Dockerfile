FROM python:3.11.6-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY requirements.txt ./
RUN pip install --no-cache-dir --requirement requirements.txt

COPY app.py number_words.py gunicorn_config.py ./

USER app

EXPOSE 8000

CMD ["gunicorn", "--config", "gunicorn_config.py", "--bind", "0.0.0.0:8000", "--workers", "2", "--threads", "4", "app:application"]
