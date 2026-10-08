import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, listUsersDetailed } from "@/lib/access";
import { getFleet } from "@/lib/fleet";
import { getBillingService } from "@/lib/pod-service";
import DashboardPage from "@/components/dashboard-page";
import AdminUserRow from "@/components/admin-user-row";
import AdminPodsTable, { POD_SORT_KEYS, type PodSortKey } from "@/components/admin-pods-table";
import { FREE_POD_OFFERS } from "@podway/shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "User" };

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

/** One user: where they came from, their free-pod offer, billing, logins — and their pods (the same table
 * as /admin/pods, filtered to this owner). Reached by clicking a row on /admin/users. */
export default async function AdminUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const u = (await listUsersDetailed()).find((x) => x.id === id);
  if (!u) notFound();
  const sort: PodSortKey = POD_SORT_KEYS.includes(sp.sort as PodSortKey) ? (sp.sort as PodSortKey) : "pod";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const [fleet, acct] = await Promise.all([getFleet(), getBillingService().getAccount(id).catch(() => null)]);
  const pods = fleet.pods.filter((p) => p.pod.ownerId === id);
  const offer = u.freeOffer && Object.hasOwn(FREE_POD_OFFERS, u.freeOffer) ? FREE_POD_OFFERS[u.freeOffer] : null;

  const facts: [string, React.ReactNode][] = [
    ["Email", u.email],
    ["Access", u.approved ? "approved" : <span className="text-destructive">revoked</span>],
    ["Registered", when(u.createdAt)],
    ["Came from (ref)", <span key="ref" className="font-mono">{u.ref ?? "—"}</span>],
    ["Free pod", offer ? `${offer.label} (up to ${offer.ramGb} GB) · since ${when(u.freeOfferSince)}` : "—"],
    ["Card on file", u.hasCard ? "yes" : "no"],
    ["Credit", acct ? `$${(acct.creditCents / 100).toFixed(2)}` : "—"],
    ["Last login", `${when(u.lastLoginAt)} · ${u.loginCount} login${u.loginCount === 1 ? "" : "s"}`],
    ["Last IP", <span key="ip" className="font-mono">{u.lastIp ?? "—"}</span>],
  ];

  return (
    <DashboardPage
      title={u.name || u.email}
      intro={`${pods.length} pod${pods.length === 1 ? "" : "s"}`}
      backHref="/admin/users"
      backLabel="Users"
      actions={<AdminUserRow id={u.id} approved={u.approved} />}
      wide
    >
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[13px]">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-8 mb-2 text-[13px] font-semibold">Pods</h2>
      {pods.length ? (
        <AdminPodsTable pods={pods} sort={sort} dir={dir} basePath={`/admin/users/${id}`} />
      ) : (
        <p className="text-[13px] text-muted-foreground">No pods.</p>
      )}
      <p className="text-[12px] text-muted-foreground">
        Revoke removes access AND suspends this user&rsquo;s running pods (data kept). <Link className="underline" href="/admin/pods">All pods →</Link>
      </p>
    </DashboardPage>
  );
}
