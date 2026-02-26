import "dotenv/config";
import { app } from "./app";
import { PrismaClient } from "@prisma/client";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
