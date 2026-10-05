const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export function createUserService({ repository }) {
  return {
    async health() {
      await repository.health();
      return { status: 'ok', service: 'user-service' };
    },

    async list() {
      return repository.list();
    },

    async get(id) {
      const user = await repository.findById(parseId(id));
      if (!user) {
        throw new HttpError(404, 'User not found');
      }

      return user;
    },

    async create(input) {
      const user = validateCreate(input);
      try {
        return await repository.create(user);
      } catch (error) {
        throw mapDatabaseError(error);
      }
    },

    async update(id, input) {
      const user = validateUpdate(input);
      try {
        const updated = await repository.update(parseId(id), user);
        if (!updated) {
          throw new HttpError(404, 'User not found');
        }

        return updated;
      } catch (error) {
        throw mapDatabaseError(error);
      }
    },

    async remove(id) {
      try {
        const deleted = await repository.remove(parseId(id));
        if (!deleted) {
          throw new HttpError(404, 'User not found');
        }
      } catch (error) {
        throw mapDatabaseError(error);
      }
    }
  };
}

function validateCreate(input) {
  if (!input || typeof input !== 'object') {
    throw new HttpError(400, 'Request body must be an object');
  }

  return {
    email: validateEmail(input.email),
    name: validateName(input.name)
  };
}

function validateUpdate(input) {
  if (!input || typeof input !== 'object') {
    throw new HttpError(400, 'Request body must be an object');
  }

  const update = {};
  if (Object.hasOwn(input, 'email')) {
    update.email = validateEmail(input.email);
  }
  if (Object.hasOwn(input, 'name')) {
    update.name = validateName(input.name);
  }
  if (Object.keys(update).length === 0) {
    throw new HttpError(400, 'At least one of email or name is required');
  }

  return update;
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, 'User id must be a positive integer');
  }

  return id;
}

function validateEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'Valid email is required');
  }

  return email;
}

function validateName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 120) {
    throw new HttpError(400, 'Name must contain 1 to 120 characters');
  }

  return name;
}

function mapDatabaseError(error) {
  if (error instanceof HttpError) {
    return error;
  }
  if (error?.code === 'P2002') {
    return new HttpError(409, 'Email is already registered');
  }
  if (error?.code === 'P2025') {
    return new HttpError(404, 'User not found');
  }

  return error;
}
