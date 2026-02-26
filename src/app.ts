import express, { Request, Response } from "express";
import { HTTP_CODES } from "./utils/constants";
import { prisma } from "./lib/prisma";
import { turnOldestToPrimary } from "./bussiness/user";
import { LinkPrecedence } from "@prisma/client";

export const app = express();

app.use(express.json());


app.post("/identity", async (req: Request, res: Response) => {
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

    const result = await prisma.$transaction(async (tx) => {
      // 1) Find any matching contact (PRIMARY or SECONDARY)
      const emailMatch = email
        ? await tx.user.findFirst({ where: { email } })
        : null;

      const phoneMatch = phoneNumber
        ? await tx.user.findFirst({ where: { phoneNumber } })
        : null;

      // 2) Resolve root primary ids
      const emailRootId =
        emailMatch ? (emailMatch.linkPrecedence === LinkPrecedence.PRIMARY ? emailMatch.id : emailMatch.linkedId!) : null;

      const phoneRootId =
        phoneMatch ? (phoneMatch.linkPrecedence === LinkPrecedence.PRIMARY ? phoneMatch.id : phoneMatch.linkedId!) : null;

      let primaryContactId: number;

      // 3) Decide primaryContactId, merge if needed
      if (!emailRootId && !phoneRootId) {
        const created = await tx.user.create({
          data: {
            email: email ?? null,
            phoneNumber: phoneNumber ?? null,
            linkPrecedence: LinkPrecedence.PRIMARY,
          },
        });
        primaryContactId = created.id;
      } else if (emailMatch && phoneMatch && emailRootId !== phoneRootId) {
        primaryContactId = await turnOldestToPrimary(emailMatch, phoneMatch);
      } else {
        primaryContactId = (emailRootId ?? phoneRootId)!;
      }

      // 4) Fetch chain
      const chain = await tx.user.findMany({
        where: {
          OR: [{ id: primaryContactId }, { linkedId: primaryContactId }],
        },
        orderBy: { id: "asc" },
      });

      const emailsInChain = new Set(chain.map((c) => c.email).filter(Boolean) as string[]);
      const phonesInChain = new Set(chain.map((c) => c.phoneNumber).filter(Boolean) as string[]);

      // 5) Only create secondary if it adds NEW info
      const addsNewEmail = email ? !emailsInChain.has(email) : false;
      const addsNewPhone = phoneNumber ? !phonesInChain.has(phoneNumber) : false;

      if (addsNewEmail || addsNewPhone) {
        const createdSecondary = await tx.user.create({
          data: {
            email: email ?? null,
            phoneNumber: phoneNumber ?? null,
            linkedId: primaryContactId,
            linkPrecedence: LinkPrecedence.SECONDARY,
          },
        });

        // update chain sets
        if (createdSecondary.email) emailsInChain.add(createdSecondary.email);
        if (createdSecondary.phoneNumber) phonesInChain.add(createdSecondary.phoneNumber);

        chain.push(createdSecondary);
      }

      const secondaryContactIds = chain
        .filter((c) => c.linkPrecedence === LinkPrecedence.SECONDARY)
        .map((c) => c.id);

      return {
        primaryContactId,
        emails: Array.from(emailsInChain),
        phoneNumbers: Array.from(phonesInChain),
        secondaryContactIds,
      };
    });

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