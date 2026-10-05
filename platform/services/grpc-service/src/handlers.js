import { UpstreamError } from './user-client.js';

const STATUS = {
  INVALID_ARGUMENT: 3,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  UNAVAILABLE: 14,
  INTERNAL: 13
};

export function createHandlers({ userClient }) {
  return {
    async getUser(call, callback) {
      try {
        const user = await userClient.getUser(call.request.id);
        callback(null, toGrpcUser(user));
      } catch (error) {
        callback(toGrpcError(error));
      }
    },

    async listUsers(_call, callback) {
      try {
        const users = await userClient.listUsers();
        callback(null, { users: users.map(toGrpcUser) });
      } catch (error) {
        callback(toGrpcError(error));
      }
    },

    check(_call, callback) {
      callback(null, { status: 1 });
    }
  };
}

export function toGrpcUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt || '',
    updatedAt: user.updatedAt || ''
  };
}

export function toGrpcError(error) {
  if (error instanceof UpstreamError) {
    const codeByHttpStatus = {
      400: STATUS.INVALID_ARGUMENT,
      404: STATUS.NOT_FOUND,
      409: STATUS.ALREADY_EXISTS,
      503: STATUS.UNAVAILABLE
    };
    return createGrpcError(codeByHttpStatus[error.statusCode] || STATUS.INTERNAL, error.message);
  }

  return createGrpcError(STATUS.INTERNAL, 'Internal server error');
}

function createGrpcError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
