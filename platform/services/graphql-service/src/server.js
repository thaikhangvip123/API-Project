import { ApolloServer } from '@apollo/server';
import { createGrpcUserClient, createRestUserClient } from './clients.js';
import { createHttpServer, createJsonLogger } from './http.js';
import { createResolvers, typeDefs } from './resolvers.js';

const port = Number(process.env.PORT || 4000);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

const logger = createJsonLogger();
const grpcUserClient = createGrpcUserClient();
const resolvers = createResolvers({ restUserClient: createRestUserClient(), grpcUserClient });
const apolloServer = new ApolloServer({ typeDefs, resolvers });
await apolloServer.start();

const httpServer = createHttpServer({ apolloServer, logger });
httpServer.listen(port, '0.0.0.0', () => {
  logger.info({ event: 'service_started', service: 'graphql-service', port });
});

async function shutdown() {
  logger.info({ event: 'service_stopping', service: 'graphql-service' });
  grpcUserClient.close();
  await apolloServer.stop();
  httpServer.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
