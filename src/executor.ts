import { Knex } from "knex";
import { ModelOptions, QueryCallback, SoftDeleteMode, WithCallback, WithInput } from "./types";
import { controlOutput } from "./helper";

export async function executeGet<R extends any[], T extends {}>(
    currentQuery: Knex.QueryBuilder<R, any>,
    options: Partial<ModelOptions<T>>,
    tableName: string,
    deletedAt: string,
    softDeleteMode: SoftDeleteMode,
    withRelations: WithInput[]
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
    const cleanResults = controlOutput(results, options);

    if (cleanResults.length === 0 || withRelations.length === 0) {
        return cleanResults;
    }

    // 2. Normalisasi withRelations
    // Contoh: 'posts.comments' -> { posts: (q) => q.with('comments') }
    const normalized = normalizeWith(withRelations);

    // 3. Eager Loading (Phase "Stitching")
    for (const [relName, callback] of Object.entries(normalized)) {
        const relConfig = options.relations?.[relName];
        if (!relConfig) {
            throw new Error(`Oerem Error: Relation [${relName}] not defined in model [${tableName}].`);
        }

        // Ambil Model Anak dari Thunk () => Post
        const ChildModel = relConfig.modelThunk();
        const localKey = relConfig.localKey || 'id';
        const foreignKey = relConfig.foreignKey;

        // Koleksi semua ID unik dari Parent
        const parentIds = [...new Set(cleanResults.map((p: any) => p[localKey]))].filter(Boolean);
        if (parentIds.length === 0) continue;

        // Buat Builder baru untuk Anak dan terapkan filter parentIds
        let childBuilder = ChildModel.query((q: any) => q.whereIn(foreignKey, parentIds));

        // Jalankan callback user jika ada filter tambahan (misal: .orderBy atau .with nested)
        if (callback) {
            childBuilder = callback(childBuilder);
        }

        // Eksekusi Ambil Data Anak (Rekursif terjadi di sini jika ada .with di dalam callback)
        const childResults = await childBuilder.get();

        // 4. "Menjahit" Data Anak ke Parent
        cleanResults.forEach((parent: any) => {
            if (relConfig.type === 'hasMany') {
                parent[relName] = childResults.filter((c: any) => c[foreignKey] === parent[localKey]);
            } else if (relConfig.type === 'hasOne' || relConfig.type === 'belongsTo') {
                parent[relName] = childResults.find((c: any) => c[foreignKey] === parent[localKey]) || null;
            }
        });
    }

    return cleanResults
}

/**
 * Fungsi helper untuk mengubah string/array menjadi objek callback seragam
 */
function normalizeWith(inputs: WithInput[]): Record<string, WithCallback> {
    const normalized: Record<string, WithCallback> = {};

    inputs.forEach(input => {
        if (typeof input === 'string') {
            // Handle dot notation: 'posts.comments'
            const parts = input.split('.');
            const first = parts.shift()!;

            if (parts.length > 0) {
                // Jika masih ada sisa (nested), buat callback rekursif
                normalized[first] = (q) => q.with(parts.join('.'));
            } else {
                // Relasi biasa tanpa filter
                normalized[first] = (q) => q;
            }
        } else {
            // Handle objek callback: { posts: (q) => ... }
            Object.assign(normalized, input);
        }
    });

    return normalized;
}