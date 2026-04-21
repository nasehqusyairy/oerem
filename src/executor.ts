import { Knex } from "knex";
import {
    ModelOptions,
    // QueryCallback,
    SoftDeleteMode,
    WithCallback,
    WithInput,
    RelationConfig,
    Wrapper
} from "./types";
import { controlOutput } from "./helper";

export async function executeGet<R extends unknown, T extends Record<string, unknown>, U extends Record<string, unknown> = {}>(
    currentQuery: Knex.QueryBuilder<T, unknown[]>,
    options: Partial<ModelOptions<T, U>>,
    tableName: string,
    deletedAt: string,
    softDeleteMode: SoftDeleteMode,
    withRelations: WithInput<U>[],
    getConnection: () => Knex
): Promise<(R & Wrapper<U>)[]> {
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

    const qresults = await currentQuery;
    const results = Array.isArray(qresults) ? qresults : (qresults ? [qresults] : []);
    const cleanResults = controlOutput(results, options);

    if (cleanResults.length === 0) {
        return cleanResults as (R & Wrapper<U>)[];
    }

    if (withRelations.length) {

        // 2. Normalisasi withRelations
        // Contoh: 'posts.comments' -> { posts: (q) => q.with('comments') }
        const normalized = normalizeWith(...withRelations);
        // console.log(withRelations);

        // console.log(normalized);


        // 3. Eager Loading (Phase "Stitching")
        for (const [relName, callback] of Object.entries(normalized)) {
            const relConfig = options.relations?.[relName as string] as RelationConfig | undefined;
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
            const isBelongsToMany = relConfig._type === 'belongsToMany';
            const isBelongsTo = relConfig._type === 'belongsTo';
            const parentKey = isBelongsToMany ? (relConfig.localKey || 'id') : (isBelongsTo ? relConfig.foreignKey : (relConfig.localKey || 'id'));

            // 1. Koleksi semua ID unik dari Parent yang akan dicocokkan
            const parentIds = [...new Set(cleanResults.map((p: any) => p[parentKey]))].filter(Boolean);

            // Jika tidak ada ID di parent, inisialisasi relasi sebagai kosong/null dan skip query
            if (parentIds.length === 0) {
                cleanResults.forEach((p: any) => {
                    p[relName] = (relConfig._type === 'hasMany' || relConfig._type === 'belongsToMany') ? [] : null;
                });
                continue;
            }

            let childBuilder: any;
            const childKey = isBelongsTo ? (relConfig.localKey || 'id') : relConfig.foreignKey;


            if (isBelongsToMany) {
                childBuilder = ChildModel.query((q) => {
                    q.join(
                        relConfig.pivotTable!,
                        `${ChildModel.tableName}.${relConfig.foreignKey || 'id'}`,
                        '=',
                        `${relConfig.pivotTable}.${relConfig.relatedPivotKey}`
                    );

                    // Ambil semua kolom dari tabel child
                    q.select(`${ChildModel.tableName}.*`);

                    // Ambil SEMUA kolom dari tabel pivot dan beri prefix agar tidak bentrok
                    // Atau setidaknya ambil foreignPivotKey untuk mapping
                    q.select(`${relConfig.pivotTable}.*`);

                    // Kita tetap butuh alias khusus untuk mapping IDs
                    q.select(`${relConfig.pivotTable}.${relConfig.foreignPivotKey} as _pivot_parent_id`);

                    q.whereIn(`${relConfig.pivotTable}.${relConfig.foreignPivotKey}`, parentIds);
                    return q;
                });
            } else {
                // 2. Buat Builder baru untuk Anak
                // Kita menggunakan childKey untuk memfilter data anak yang berhubungan saja
                childBuilder = ChildModel.query((q) => {
                    q.whereIn(childKey, parentIds);
                    return q;
                });
            }

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

                if (relConfig._type === 'belongsToMany') {
                    // 1. Ambil semua baris yang cocok
                    const matchingChildren = childResults.filter((c: any) => c._pivot_parent_id === pVal);

                    parent[relName] = matchingChildren.map((c: any) => {
                        // 2. Clone objek agar tidak merusak data asli jika satu child punya banyak parent
                        const childClone = { ...c };

                        // 3. Pindahkan data pivot ke objek 'pivot'
                        // Kita bisa menentukan kolom mana saja yang masuk ke pivot
                        // Untuk simplisitas, kita ambil foreignPivotKey dan relatedPivotKey
                        childClone.pivot = {
                            [relConfig.foreignPivotKey!]: c[relConfig.foreignPivotKey!],
                            [relConfig.relatedPivotKey!]: c[relConfig.relatedPivotKey!],
                        };

                        // Jika ada kolom tambahan di pivot (misal 'status', 'created_at')
                        // Kamu bisa menambahkannya ke sini. 

                        // 4. Bersihkan kolom temporary dan kolom pivot dari level root objek child
                        delete childClone._pivot_parent_id;
                        // delete childClone[relConfig.foreignPivotKey]; // Opsional jika ingin root bersih
                        // delete childClone[relConfig.relatedPivotKey];

                        return childClone;
                    });
                } else if (relConfig._type === 'hasMany') {
                    // Filter semua anak yang punya FK cocok dengan PK parent
                    parent[relName] = childResults.filter((c: any) => c[childKey] === pVal);
                } else {
                    // hasOne atau belongsTo: Ambil satu saja atau null
                    parent[relName] = childResults.find((c: any) => c[childKey] === pVal) || null;
                }
            });
        }
    }

    // Definisikan .related() untuk setiap item hasil query
    wrapOutput(cleanResults, options, getConnection);

    return cleanResults as (R & Wrapper<U>)[];
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

// relations/handler.ts

export const createRelationHandler = (getConnection: any, parentId: any, relConfig: any) => {
    const runner = getConnection();
    const ChildModel = relConfig.modelThunk();
    const pk = ChildModel.primaryKey || 'id';

    const baseMethods = {
        async create(data: any) {
            const payload = relConfig._type !== 'belongsToMany'
                ? { ...data, [relConfig.foreignKey]: parentId }
                : data;

            const newChild = await ChildModel.create(payload);

            if (relConfig._type === 'belongsToMany') {
                await (this as any).attach(newChild[pk]);
            }
            return newChild;
        },

        async insert(records: any[]) {
            const payloads = records.map(data => (
                relConfig._type !== 'belongsToMany'
                    ? { ...data, [relConfig.foreignKey]: parentId }
                    : data
            ));

            if (relConfig._type === 'belongsToMany') {
                // Untuk many-to-many, kita insert data baru dulu, lalu attach
                const results = [];
                for (const payload of payloads) {
                    results.push(await this.create(payload));
                }
                return results;
            }

            return await ChildModel.insert(payloads);
        },

        /**
         * Update data anak yang terkait. 
         * Jika ID tidak disertakan, maka akan mengupdate SEMUA data terkait (Hati-hati).
         */
        async update(idOrData: any, data?: any) {
            const isSingleUpdate = data !== undefined;
            const updateData = isSingleUpdate ? data : idOrData;

            return await ChildModel.query((q: any) => {
                // Pastikan kueri hanya menyentuh milik parent ini
                if (relConfig._type === 'belongsToMany') {
                    q.whereIn(pk, runner(relConfig.pivotTable)
                        .select(relConfig.relatedPivotKey)
                        .where(relConfig.foreignPivotKey, parentId)
                    );
                } else {
                    q.where(relConfig.foreignKey, parentId);
                }

                // Jika ada ID spesifik, persempit kueri
                if (isSingleUpdate) {
                    q.where(pk, idOrData);
                }
            }).update(updateData);
        },

        /**
         * Delete data anak. 
         * Jika ID tidak disertakan, akan menghapus SEMUA data terkait.
         */
        async delete(id?: any) {
            return await ChildModel.query((q: any) => {
                if (relConfig._type === 'belongsToMany') {
                    q.whereIn(pk, runner(relConfig.pivotTable)
                        .select(relConfig.relatedPivotKey)
                        .where(relConfig.foreignPivotKey, parentId)
                    );
                } else {
                    q.where(relConfig.foreignKey, parentId);
                }

                if (id) q.where(pk, id);
            }).delete();
        },

        /**
         * Soft Delete data anak jika model mendukung.
         */
        async softDelete(id?: any) {
            return await ChildModel.query((q: any) => {
                if (relConfig._type === 'belongsToMany') {
                    q.whereIn(pk, runner(relConfig.pivotTable)
                        .select(relConfig.relatedPivotKey)
                        .where(relConfig.foreignPivotKey, parentId)
                    );
                } else {
                    q.where(relConfig.foreignKey, parentId);
                }

                if (id) q.where(pk, id);
            }).softDelete();
        }
    };

    // Method khusus untuk Many-to-Many
    if (relConfig._type === 'belongsToMany') {
        return {
            ...baseMethods,
            async attach(ids: any | any[], extraPivotData = {}) {
                const idArray = Array.isArray(ids) ? ids : [ids];
                const payload = idArray.map(id => ({
                    [relConfig.foreignPivotKey]: parentId,
                    [relConfig.relatedPivotKey]: id,
                    ...extraPivotData
                }));
                return await runner(relConfig.pivotTable).insert(payload);
            },
            async detach(ids?: any | any[]) {
                const q = runner(relConfig.pivotTable).where(relConfig.foreignPivotKey, parentId);
                if (ids) q.whereIn(relConfig.relatedPivotKey, Array.isArray(ids) ? ids : [ids]);
                return await q.del();
            },
            async updatePivot(id: any, data: any) {
                return await runner(relConfig.pivotTable)
                    .where(relConfig.foreignPivotKey, parentId)
                    .where(relConfig.relatedPivotKey, id)
                    .update(data);
            },
            /**
             * Sync: Menghapus yang tidak ada di array, dan menambah yang baru.
             */
            async sync(ids: any[]) {
                await this.detach();
                return await this.attach(ids);
            }
        };
    }

    return baseMethods;
};

export const wrapOutput = (results: any, options: Partial<ModelOptions<any>>, getConnection: () => Knex) => {
    results.forEach((item: any) => {
        // Definisikan .related()
        Object.defineProperty(item, 'related', {
            enumerable: false,
            value: async function (actions: Record<string, (h: any) => Promise<any>>) {
                const results: Record<string, any> = {};
                const pk = options.primaryKey || 'id';
                const parentId = this[pk];

                for (const [relName, callback] of Object.entries(actions)) {
                    const relConfig = (options.relations as Record<string, RelationConfig>)?.[relName];
                    if (!relConfig) throw new Error(`Relation ${relName} not found`);

                    // 1. Buat handler untuk relasi ini
                    const handler = createRelationHandler(getConnection, parentId, relConfig);

                    // 2. Jalankan aksi dari user
                    results[relName] = await callback(handler);
                }
                return results;
            }
        });
    });
}