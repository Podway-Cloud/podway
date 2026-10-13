import "server-only";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getPodService } from "@/lib/pod-service";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** A small, owner-scoped write that the browser can finish after leaving the cockpit. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // JSON requests require a CORS preflight from another origin; plain HTML forms
  // must not be able to make this authenticated write with the owner's cookie.
  const contentType = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "JSON body required" }, { status: 415 });
  }

  let name: unknown;
  try {
    name = ((await req.json()) as { name?: unknown }).name;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof name !== "string") {
    return NextResponse.json({ error: "name must be a string" }, { status: 400 });
  }

  const { slug } = await params;
  try {
    await getPodService().setName(user.id, slug, name);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "couldn't rename pod" },
      { status: 400 },
    );
  }
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/pods/${slug}`);
  return NextResponse.json({ ok: true });
}
