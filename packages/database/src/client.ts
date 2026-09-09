import dotenv from "dotenv";
import path from "path";

dotenv.config({
    path: path.resolve(import.meta.dirname, "../../../.env")
});

const databaseUrl = process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// In-memory session store — used when DATABASE_URL is not configured.
// Satisfies the subset of the Prisma session API used by the server routes.
// ---------------------------------------------------------------------------

type Session = {
    id: string;
    title: string;
    cwd: string;
    userId: string;
    messages: unknown[];
    createdAt: Date;
    updatedAt: Date;
};

function createInMemoryDb() {
    const sessions = new Map<string, Session>();

    const sessionClient = {
        findMany: async ({ where, orderBy, select }: any) => {
            let results = Array.from(sessions.values()).filter(
                (s) => !where?.userId || s.userId === where.userId,
            );
            if (orderBy?.createdAt === "desc") {
                results = results.sort(
                    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
                );
            }
            if (select) {
                return results.map((s) => {
                    const out: any = {};
                    for (const key of Object.keys(select)) out[key] = (s as any)[key];
                    return out;
                });
            }
            return results;
        },
        findUnique: async ({ where }: any) => {
            const s = sessions.get(where.id);
            if (!s) return null;
            if (where.userId && s.userId !== where.userId) return null;
            return s;
        },
        create: async ({ data }: any) => {
            const id = data.id ?? crypto.randomUUID();
            const now = new Date();
            const session: Session = {
                id,
                title: data.title ?? "Untitled",
                cwd: data.cwd ?? process.cwd(),
                userId: data.userId ?? "local-dev-user",
                messages: data.messages ?? [],
                createdAt: now,
                updatedAt: now,
            };
            sessions.set(id, session);
            return session;
        },
        update: async ({ where, data }: any) => {
            const s = sessions.get(where.id);
            if (!s) throw new Error(`Session not found: ${where.id}`);
            const updated = { ...s, ...data, updatedAt: new Date() };
            sessions.set(where.id, updated);
            return updated;
        },
        delete: async ({ where }: any) => {
            const s = sessions.get(where.id);
            sessions.delete(where.id);
            return s;
        },
    };

    return { session: sessionClient };
}

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

let db: PrismaClient;

if (databaseUrl) {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    db = new PrismaClient({ adapter });
} else {
    console.warn("[CODEXA] No DATABASE_URL — using in-memory session store (data lost on restart).");
    db = createInMemoryDb() as unknown as PrismaClient;
}

export { db };