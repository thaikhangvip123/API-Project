import { UpstreamError } from './clients.js';
import { GraphQLError } from 'graphql';

export const typeDefs = `#graphql
  type User {
    id: Int!
    email: String!
    name: String!
    createdAt: String!
    updatedAt: String!
  }

  type Query {
    users: [User!]!
    user(id: Int!): User
  }
`;

export function createResolvers({ restUserClient, grpcUserClient }) {
  return {
    Query: {
      async users() {
        try {
          return await restUserClient.listUsers();
        } catch (error) {
          throw toGraphqlError(error);
        }
      },

      async user(_parent, { id }) {
        try {
          return await grpcUserClient.getUser(id);
        } catch (error) {
          if (error instanceof UpstreamError && error.statusCode === 404) {
            return null;
          }
          throw toGraphqlError(error);
        }
      }
    }
  };
}

function toGraphqlError(error) {
  const statusCode = error instanceof UpstreamError ? error.statusCode : 500;
  const message = error instanceof UpstreamError && (statusCode === 400 || statusCode === 503)
    ? error.message
    : 'Internal server error';
  const codeByStatus = {
    400: 'BAD_USER_INPUT',
    503: 'SERVICE_UNAVAILABLE'
  };
  return new GraphQLError(message, { extensions: { code: codeByStatus[statusCode] || 'INTERNAL_SERVER_ERROR' } });
}
