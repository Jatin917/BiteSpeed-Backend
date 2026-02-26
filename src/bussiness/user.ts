import { PrismaClient, LinkPrecedence, User } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

export const turnOldestToPrimary = async (
  user1: User,
  user2: User
): Promise<number> => {
  return prisma.$transaction(async (tx) => {
    // Re-fetch inside tx to avoid stale reads and ensure both are still PRIMARY
    const u1 = await tx.user.findUnique({ where: { id: user1.id } });
    const u2 = await tx.user.findUnique({ where: { id: user2.id } });

    if (!u1 || !u2) throw new Error("User not found during merge");

    // Resolve roots (in case callers passed secondaries by mistake)
    const r1 = u1.linkPrecedence === LinkPrecedence.PRIMARY ? u1 : await tx.user.findUnique({ where: { id: u1.linkedId! } });
    const r2 = u2.linkPrecedence === LinkPrecedence.PRIMARY ? u2 : await tx.user.findUnique({ where: { id: u2.linkedId! } });

    if (!r1 || !r2) throw new Error("Root primary not found");
    if (r1.id === r2.id) return r1.id; // already same chain

    // Pick winner (oldest createdAt; if tie, smaller id)
    const winner =
      r1.createdAt < r2.createdAt
        ? r1
        : r2.createdAt < r1.createdAt
          ? r2
          : (r1.id < r2.id ? r1 : r2);

    const loser = winner.id === r1.id ? r2 : r1;

    // 1) Make loser PRIMARY into SECONDARY pointing to winner
    await tx.user.update({
      where: { id: loser.id },
      data: {
        linkPrecedence: LinkPrecedence.SECONDARY,
        linkedId: winner.id,
      },
    });

    // 2) Move all loser descendants to winner (flatten)
    await tx.user.updateMany({
      where: { linkedId: loser.id },
      data: { linkedId: winner.id },
    });

    return winner.id;
  });
};