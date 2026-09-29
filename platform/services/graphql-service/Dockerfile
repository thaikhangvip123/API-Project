FROM node:20.11-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY proto ./proto
COPY src ./src

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD ["wget", "-q", "-O", "-", "http://127.0.0.1:4000/health"]

CMD ["node", "src/server.js"]
