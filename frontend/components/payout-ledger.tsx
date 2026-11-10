"use client";
import Link from "next/link";
import { usePayouts } from "@/lib/queries";
import { dateTime, money } from "@/lib/format";
import { AsyncView, EmptyState, StatusBadge } from "./ui/shared";
export function PayoutLedger() {
  const payouts = usePayouts();
  return (
    <AsyncView query={payouts}>
      {({ items }) =>
        items.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <caption>
                Public payout records · USD · PayPal sandbox or labelled mock ·
                Recipients masked
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
                {items.map((p) => (
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
        ) : (
          <EmptyState title="The first payout is still ahead.">
            Verified cleanups will leave a payment record here.
          </EmptyState>
        )
      }
    </AsyncView>
  );
}
