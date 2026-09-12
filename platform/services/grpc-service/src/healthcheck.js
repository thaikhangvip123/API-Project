import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const packageDefinition = protoLoader.loadSync(join(currentDirectory, '../proto/user_lookup.proto'), { keepCase: false, enums: Number });
const definition = grpc.loadPackageDefinition(packageDefinition).platform.user.v1;
const port = Number(process.env.GRPC_SERVICE_PORT || 50051);
const client = new definition.Health(`127.0.0.1:${port}`, grpc.credentials.createInsecure());

client.check({ service: '' }, { deadline: new Date(Date.now() + 2000) }, (error, response) => {
  client.close();
  if (error || response.status !== 1) {
    process.exitCode = 1;
  }
});
