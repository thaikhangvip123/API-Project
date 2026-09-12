export function createPrismaRepository(prisma) {
  return {
    async health() {
      await prisma.$queryRaw`SELECT 1`;
    },

    list() {
      return prisma.user.findMany({ orderBy: { id: 'asc' } });
    },

    findById(id) {
      return prisma.user.findUnique({ where: { id } });
    },

    create(data) {
      return prisma.user.create({ data });
    },

    async update(id, data) {
      try {
        return await prisma.user.update({ where: { id }, data });
      } catch (error) {
        if (error?.code === 'P2025') {
          return null;
        }
        throw error;
      }
    },

    async remove(id) {
      try {
        await prisma.user.delete({ where: { id } });
        return true;
      } catch (error) {
        if (error?.code === 'P2025') {
          return false;
        }
        throw error;
      }
    }
  };
}
