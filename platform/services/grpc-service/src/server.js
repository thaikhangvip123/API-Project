import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHandlers } from './handlers.js';
import { createUserClient } from './user-client.js';

const port = Number(process.env.GRPC_SERVICE_PORT || 50051);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error('GRPC_SERVICE_PORT must be a valid TCP port');
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const packageDefinition = protoLoader.loadSync(join(currentDirectory, '../proto/user_lookup.proto'), {
  keepCase: false,
  longs: Number,
  enums: Number,
  defaults: true,
  oneofs: true
});
const definition = grpc.loadPackageDefinition(packageDefinition).platform.user.v1;
const server = new grpc.Server();
const logger = createJsonLogger();
const handlers = createHandlers({ userClient: createUserClient() });

server.addService(definition.UserLookupService.service, {
  getUser: handlers.getUser,
  listUsers: handlers.listUsers
});
server.addService(definition.Health.service, { check: handlers.check });

server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error) => {
  if (error) {
    throw error;
  }
  logger.info({ event: 'service_started', service: 'grpc-service', port });
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  logger.info({ event: 'service_stopping', service: 'grpc-service' });
  server.tryShutdown(() => process.exit(0));
}

function createJsonLogger() {
  function log(level, data) {
    const output = JSON.stringify({ level, timestamp: new Date().toISOString(), ...data });
    (level === 'error' ? console.error : console.log)(output);
  }
  return { info: (data) => log('info', data), error: (data) => log('error', data) };
}
