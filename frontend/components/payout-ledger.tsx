"use client";
import Link from "next/link";
import { useState } from "react";
import { Pagination } from "./ui/pagination";
import { LedgerPlaceholder } from "./workspace-placeholder";
import { usePayouts } from "@/lib/queries";
import { dateTime, money } from "@/lib/format";
import { AsyncView, EmptyState, StatusBadge } from "./ui/shared";
export function PayoutLedger() {
  const payouts = usePayouts();
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil((payouts.data?.items.length ?? 0) / 10));
  const currentPage = Math.min(page, pages);
  return (
    <AsyncView query={payouts} loading={<LedgerPlaceholder />}>
      {({ items }) =>
        items.length ? (
          <div>
            <div className="table-wrap">
              <table className="data-table">
                <caption>
                  Payout records · INR estimates · USD settlement · PayPal
                  sandbox or labelled mock · Recipients masked
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Cleanup reward</th>
                    <th scope="col">Recipient</th>
                    <th scope="col">Status</th>
                    <th scope="col">PayPal reference</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {items
                    .slice((currentPage - 1) * 10, currentPage * 10)
                    .map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/bounties/${p.bounty_id}`}>
                            {money(p.amount_cents)}
                          </Link>
                        </td>
                        <td>{p.receiver_masked}</td>
                        <td>
                          <StatusBadge status={p.status} />
                        </td>
                        <td>
                          <code>{p.paypal_batch_id ?? "Not sent yet"}</code>
                        </td>
                        <td>{dateTime(p.updated_at)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <Pagination
              label="Payout pages"
              page={currentPage}
              pages={pages}
              onChange={setPage}
            />
          </div>
        ) : (
          <EmptyState title="No payouts yet.">
            Verified cleanups will leave a payment record here.
          </EmptyState>
        )
      }
    </AsyncView>
  );
}
