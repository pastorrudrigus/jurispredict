# JurisPredict - imagem de producao
FROM python:3.11-slim

# Evita .pyc e garante logs sem buffer
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Instala dependencias primeiro (melhor cache de camadas)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o codigo
COPY previne/ ./previne/
COPY api/ ./api/

EXPOSE 8000

# A maioria dos PaaS injeta a porta via $PORT; usamos shell form para expandir.
CMD uvicorn api.main:app --host 0.0.0.0 --port ${PORT}
