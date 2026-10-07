import { getMobileLockState } from "@/lib/mobile-app-lock";

export async function GET() {
  const state = await getMobileLockState();
  return Response.json(state ?? { enabled: false });
}