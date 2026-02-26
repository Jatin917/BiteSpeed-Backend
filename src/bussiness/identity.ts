import { LinkPrecedence, Prisma } from "../generated/prisma/client";
import { turnOldestToPrimary } from "./user";

type IdentityInput = {
  email?: string;
  phoneNumber?: string;
};

type IdentityResult = {
  primaryContactId: number;
  emails: string[];
  phoneNumbers: string[];
  secondaryContactIds: number[];
};

export const resolveIdentity = async (
  tx: Prisma.TransactionClient,
  input: IdentityInput
): Promise<IdentityResult> => {
  const { email, phoneNumber } = input;

  const emailMatch = email ? await tx.user.findFirst({ where: { email } }) : null;
  const phoneMatch = phoneNumber
    ? await tx.user.findFirst({ where: { phoneNumber } })
    : null;

  const emailRootId = emailMatch
    ? emailMatch.linkPrecedence === LinkPrecedence.PRIMARY
      ? emailMatch.id
      : emailMatch.linkedId
    : null;

  const phoneRootId = phoneMatch
    ? phoneMatch.linkPrecedence === LinkPrecedence.PRIMARY
      ? phoneMatch.id
      : phoneMatch.linkedId
    : null;

  let primaryContactId: number;

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
    primaryContactId = await turnOldestToPrimary(tx, emailMatch, phoneMatch);
  } else {
    primaryContactId = (emailRootId ?? phoneRootId)!;
  }

  let chain = await tx.user.findMany({
    where: {
      OR: [{ id: primaryContactId }, { linkedId: primaryContactId }],
    },
    orderBy: { id: "asc" },
  });

  const emailsInChain = new Set(
    chain.map((contact) => contact.email).filter(Boolean) as string[]
  );
  const phonesInChain = new Set(
    chain.map((contact) => contact.phoneNumber).filter(Boolean) as string[]
  );

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
    chain.push(createdSecondary);
    if (createdSecondary.email) {
      emailsInChain.add(createdSecondary.email);
    }
    if (createdSecondary.phoneNumber) {
      phonesInChain.add(createdSecondary.phoneNumber);
    }
  }

  const secondaryContactIds = chain
    .filter((contact) => contact.linkPrecedence === LinkPrecedence.SECONDARY)
    .map((contact) => contact.id);

  return {
    primaryContactId,
    emails: Array.from(emailsInChain),
    phoneNumbers: Array.from(phonesInChain),
    secondaryContactIds,
  };
};
