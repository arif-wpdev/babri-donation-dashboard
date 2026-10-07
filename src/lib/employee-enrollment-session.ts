import type { Prisma } from "@prisma/client";

type IssueEmployeeSessionInput = {
  userId: string;
  name: string | null;
  email: string;
  role: "ORG_USER";
  orgId: string;
  orgSlug: string;
  consumeEnrollment: (tx: Prisma.TransactionClient) => Promise<void>;
};

export async function consumeEmployeeEnrollment(input: IssueEmployeeSessionInput, tx: Prisma.TransactionClient) {
  await input.consumeEnrollment(tx);
}
