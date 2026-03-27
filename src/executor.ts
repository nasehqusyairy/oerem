import { Knex } from "knex";
import { ModelOptions, SoftDeleteMode } from "./types";
import { controlOutput } from "./helper";

export async function executeGet<R extends any[], T extends {}>(
    currentQuery: Knex.QueryBuilder<R, any>,
    options: Partial<ModelOptions<T>>,
    tableName: string,
    deletedAt: string,
    softDeleteMode: SoftDeleteMode
): Promise<R> {
    // Cek internal Knex (mengintip state)
    const statement = (currentQuery as any).toSQL().method;
    const isInsertOrUpdate = ['insert', 'update', 'delete', 'del', 'first'].includes(statement)
    const isFirst = statement === 'first';

    if (isFirst) {
        throw new Error("Oerem: 'first' is not allowed in 'get' query. Use 'find' or 'first' method instead.");
    }

    if (isInsertOrUpdate) {
        throw new Error("Oerem: Illegal write operation detected in a read query!");
    }

    // Terapkan Logika Soft Delete Global Scope
    if (options.softDelete) {

        // 1. Ambil informasi "from" dari internal Knex
        const fromTarget = (currentQuery as any)._single?.table;
        let targetPrefix = tableName; // Default ke nama tabel asli

        // 2. Jika user pakai alias (misal: "users as u"), kita ekstrak "u"
        if (typeof fromTarget === 'string' && fromTarget.includes(' as ')) {
            targetPrefix = fromTarget.split(' as ').pop()?.trim() || tableName;
        }

        const column = `${targetPrefix}.${deletedAt}`;

        if (softDeleteMode === 'active') {
            currentQuery.whereNull(column);
        } else if (softDeleteMode === 'only') {
            currentQuery.whereNotNull(column);
        }
    }

    const results = await currentQuery;

    return controlOutput(results, options)
}