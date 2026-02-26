import express, { Request, Response } from "express";
import { prisma } from "./prisma";

const app = express();

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

export { app };
