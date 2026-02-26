import express, { Request, Response } from "express";
import { HTTP_CODES } from "./utils/constants";
import { prisma } from "./lib/prisma";
import { resolveIdentity } from "./bussiness/identity";

export const app = express();

app.use(express.json());


app.post("/identify", async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body as {
      email?: string;
      phoneNumber?: string;
    };

    if (!email && !phoneNumber) {
      return res.status(HTTP_CODES.BAD_REQUEST).json({
        message: "email or phoneNumber is required",
      });
    }

    const result = await prisma.$transaction((tx) =>
      resolveIdentity(tx, { email, phoneNumber })
    );

    return res.status(HTTP_CODES.OK).json({
      contact: {
        primaryContactId: result.primaryContactId,
        emails: result.emails,
        phoneNumbers: result.phoneNumbers,
        secondaryContactIds: result.secondaryContactIds,
      },
    });
  } catch (error) {
    console.error("Error in /identity:", error);
    return res.status(HTTP_CODES.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
});
