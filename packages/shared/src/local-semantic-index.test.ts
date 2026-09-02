import { describe, expect, it } from "bun:test";
import { LocalTfidfIndex } from "./local-semantic-index";

describe("Local TF-IDF Code Indexer", () => {
  it("indexes documents locally and searches by statistical term relevance", () => {
    const index = new LocalTfidfIndex();
    index.addDocument("src/auth.ts", "export function authenticateUser(token: string) { return verifyJwt(token); }");
    index.addDocument("src/payments/retry.ts", "export function retryFailedPayment(invoiceId: string) { return processPayment(invoiceId); }");
    index.addDocument("src/db.ts", "export const prisma = new PrismaClient();");

    const authResults = index.search("user authenticate jwt");
    expect(authResults.length).toBeGreaterThan(0);
    expect(authResults[0]!.path).toBe("src/auth.ts");

    const paymentResults = index.search("invoice payment retry");
    expect(paymentResults.length).toBeGreaterThan(0);
    expect(paymentResults[0]!.path).toBe("src/payments/retry.ts");

    const stats = index.getStats();
    expect(stats.totalFiles).toBe(3);
  });
});
