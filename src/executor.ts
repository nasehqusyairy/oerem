import { Knex } from "knex";
import { ModelOptions, QueryCallback, SoftDeleteMode, WithCallback, WithInput } from "./types";
import { controlOutput } from "./helper";

export async function executeGet<R extends any[], T extends {}, U extends {} = {}>(
    currentQuery: Knex.QueryBuilder<R, any>,
    options: Partial<ModelOptions<T, U>>,
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
    const normalized = normalizeWith(...withRelations);
    // console.log(withRelations);

    // console.log(normalized);


    // 3. Eager Loading (Phase "Stitching")
    for (const [relName, callback] of Object.entries(normalized)) {
        const relConfig = options.relations?.[relName as keyof U];
        if (!relConfig) {
            throw new Error(`Oerem Error: Relation [${relName}] not defined in model [${tableName}].`);
        }

        // Ambil Model Anak dari Thunk () => Post
        const ChildModel = relConfig.modelThunk();

        /**
         * LOGIKA PENENTUAN KUNCI (KEY)
         * - belongsTo: Parent mencari 'user_id' (FK), Child mencari 'id' (PK)
         * - hasMany/One: Parent mencari 'id' (PK), Child mencari 'user_id' (FK)
         */
        const isBelongsTo = relConfig.type === 'belongsTo';
        const parentKey = isBelongsTo ? relConfig.foreignKey : (relConfig.localKey || 'id');
        const childKey = isBelongsTo ? (relConfig.localKey || 'id') : relConfig.foreignKey;

        // 1. Koleksi semua ID unik dari Parent yang akan dicocokkan
        const parentIds = [...new Set(cleanResults.map((p: any) => p[parentKey]))].filter(Boolean);

        // Jika tidak ada ID di parent, inisialisasi relasi sebagai kosong/null dan skip query
        if (parentIds.length === 0) {
            cleanResults.forEach((p: any) => {
                p[relName] = relConfig.type === 'hasMany' ? [] : null;
            });
            continue;
        }

        // 2. Buat Builder baru untuk Anak
        // Kita menggunakan childKey untuk memfilter data anak yang berhubungan saja
        let childBuilder = ChildModel.query((q: any) => {
            q.whereIn(childKey, parentIds);
        });

        // 3. Jalankan callback user 
        // Penting: Di sinilah rekursi terjadi jika di dalam callback ada .with() lagi
        if (callback) {
            childBuilder = callback(childBuilder);
        }

        // 4. Eksekusi Ambil Data Anak
        const childResults = await childBuilder.get();

        // console.log(childResults);


        // 5. "Menjahit" Data Anak ke Parent yang Tepat
        cleanResults.forEach((parent: any) => {
            const pVal = parent[parentKey];

            if (relConfig.type === 'hasMany') {
                // Filter semua anak yang punya FK cocok dengan PK parent
                parent[relName] = childResults.filter((c: any) => c[childKey] === pVal);
            } else {
                // hasOne atau belongsTo: Ambil satu saja atau null
                parent[relName] = childResults.find((c: any) => c[childKey] === pVal) || null;
            }
        });
    }

    return cleanResults
}

/**
 * Fungsi helper untuk mengubah string/array menjadi objek callback seragam
 */
export function normalizeWith(...inputs: any[]): Record<string, any> {
    // input: ['posts.comments.user', { posts: (p) => p.query(q => q.where('status', 'active')) }, 'profile', 'posts.tags']
    // output: {
    //   posts: (childBuilder) => {
    //     childBuilder.with('comments.user', 'tags');
    //     childBuilder.query(q => q.where('status', 'active'));
    //   },
    //   profile: (childBuilder) => {}
    // }

    const registry: Record<string, { children: string[], modifiers: Function[] }> = {};

    inputs.forEach(item => {
        if (typeof item === 'string') {
            const [first, ...rest] = item.split('.');
            if (!registry[first]) registry[first] = { children: [], modifiers: [] };
            if (rest.length > 0) registry[first].children.push(rest.join('.'));
        }
        else if (typeof item === 'object' && item !== null) {
            for (const [key, val] of Object.entries(item)) {
                if (!registry[key]) registry[key] = { children: [], modifiers: [] };
                if (typeof val === 'function') {
                    registry[key].modifiers.push(val);
                }
            }
        }
    });

    const normalized: Record<string, any> = {};
    for (const [relName, data] of Object.entries(registry)) {
        normalized[relName] = (childBuilder: any) => {
            data.modifiers.forEach(fn => fn(childBuilder));
            if (data.children.length > 0) {
                childBuilder.with(...data.children);
            }
            return childBuilder;
        };
    }
    return normalized;
}