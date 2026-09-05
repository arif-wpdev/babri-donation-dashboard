import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const org = await prisma.organization.findFirst({
    where: { tdfApiKey: { not: null } }
  });
  
  if (!org) {
    return NextResponse.json({ error: "No org" });
  }

  const url = `${org.wcBaseUrl}/wp-json/tdf-donation/v1/donations?per_page=5&page=1`;
  const res = await fetch(url, {
    headers: { "X-TDF-Api-Key": org.tdfApiKey }
  });
  
  const data = await res.json();
  return NextResponse.json(data);
}
