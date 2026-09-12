FROM node:20.11-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY proto ./proto
COPY src ./src

ENV NODE_ENV=production
ENV GRPC_SERVICE_PORT=50051

EXPOSE 50051

HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD ["node", "src/healthcheck.js"]

CMD ["node", "src/server.js"]
