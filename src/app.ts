import express, { Request, Response } from "express";
import { ENUMS_LINK_PRECEDENCE, HTTP_CODES } from "./utils/constants";
import { prisma } from "./lib/prisma";
import { turnOldestToPrimary } from "./bussiness/user";
import { LinkPrecedence } from "@prisma/client";

const app = express();

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.post("/identity", async (_req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = _req.body as {
      email?: string;
      phoneNumber?: string;
    };

    if (!email && !phoneNumber) {
      return res
        .status(HTTP_CODES.BAD_REQUEST)
        .json({ message: "email or phoneNumber is required" });
    }

    let existingUserFromEmail = null;
    if(email){
      existingUserFromEmail = await prisma.user.findFirst({where:{email, linkPrecedence:LinkPrecedence.PRIMARY}});
    }
    let existingUserFromPhone = null;
    if(phoneNumber){
      existingUserFromPhone = await prisma.user.findFirst({where:{phoneNumber, linkPrecedence:LinkPrecedence.PRIMARY}});
    }

    if(existingUserFromEmail && existingUserFromPhone && existingUserFromEmail!=existingUserFromPhone){
      await turnOldestToPrimary(existingUserFromEmail, existingUserFromPhone);
    }

    const contactMatchConditions: { email?: string; phoneNumber?: string }[] = [];
    if (email) {
      contactMatchConditions.push({ email });
    }
    if (phoneNumber) {
      contactMatchConditions.push({ phoneNumber });
    }

    const existingContacts = await prisma.user.findMany({
      where: {
        OR: contactMatchConditions,
      },
      orderBy: { createdAt: "asc" },
    });

    let primaryContactId: number;

    if (existingContacts.length === 0) {
      // No existing contacts – create a new PRIMARY contact
      const created = await prisma.user.create({
        data: {
          email: email ?? null,
          phoneNumber: phoneNumber ?? null,
        },
      });

      primaryContactId = created.id;
    } else {
      // There is at least one existing contact
      const baseContact = existingContacts[0];

      // Determine the root primary contact id
      primaryContactId = baseContact.linkedId ?? baseContact.id;

      // Create a new SECONDARY contact linked to the primary
      await prisma.user.create({
        data: {
          email: email ?? null,
          phoneNumber: phoneNumber ?? null,
          linkedId: primaryContactId,
          linkPrecedence: "SECONDARY",
        },
      });
    }

    // Fetch all contacts in the same chain (primary + all secondaries)
    const allContactsInChain = await prisma.user.findMany({
      where: {
        OR: [{ id: primaryContactId }, { linkedId: primaryContactId }],
      },
      orderBy: { id: "asc" },
    });

    const primaryContact = allContactsInChain.find(
      (c:any) => c.linkPrecedence === "PRIMARY"
    );

    // Fallback in case of inconsistent data
    const resolvedPrimaryId = primaryContact?.id ?? primaryContactId;

    const emails = Array.from(
      new Set(
        allContactsInChain
          .map((c:any) => c.email)
          .filter((e:any): e is string => Boolean(e))
      )
    );

    const phoneNumbers = Array.from(
      new Set(
        allContactsInChain
          .map((c:any) => c.phoneNumber)
          .filter((p:any): p is string => Boolean(p))
      )
    );

    const secondaryContactIds = allContactsInChain
      .filter((c:any) => c.linkPrecedence === "SECONDARY")
      .map((c:any) => c.id);

    return res.status(HTTP_CODES.OK).json({
      contact: {
        primaryContatctId: resolvedPrimaryId,
        emails,
        phoneNumbers,
        secondaryContactIds,
      },
    });
  } catch (error) {
    console.error("Error in /identity:", error);
    return res
      .status(HTTP_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: "Internal server error" });
  }
});

export { app };
