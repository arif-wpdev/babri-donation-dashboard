import { z } from "zod";

const schema = z.object({
  status: z.enum(["A", "B"]).optional(),
  from: z.coerce.date().optional(),
});

const res = schema.safeParse({
  status: null,
  from: null,
});

console.log(res);
