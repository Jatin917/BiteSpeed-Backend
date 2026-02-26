// src/lib/prisma.ts

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";

declare global {
  var prismaPool: Pool | undefined;
  var prisma: PrismaClient | undefined;
}

const pool =
  global.prismaPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

const adapter = new PrismaPg(pool);

export const prisma =
  global.prisma ||
  new PrismaClient({
    adapter,
    log: ["query"], // optional
  });

if (process.env.NODE_ENV !== "production") {
  global.prismaPool = pool;
  global.prisma = prisma;
}
