import { PrismaClient } from '@prisma/client';
import { createJsonLogger, createServer } from './http.js';
import { createPrismaRepository } from './repository.js';
import { createUserService } from './users.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

const logger = createJsonLogger();
const prisma = new PrismaClient();
const userService = createUserService({ repository: createPrismaRepository(prisma) });
const server = createServer({ userService, logger });

server.listen(port, '0.0.0.0', () => {
  logger.info({ event: 'service_started', service: 'user-service', port });
});

async function shutdown() {
  logger.info({ event: 'service_stopping', service: 'user-service' });
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
