import knex, { Knex } from "knex";

// Aturan untuk setiap model
type ModelOptions = {
    fillable: string[];
    primaryKey: string;
    softDelete: boolean;
    deletedAtColumn: string;
    timestamps: boolean
}

type QueryCallback<T extends {}> = (qb: Knex.QueryBuilder<T, any>) => Knex.QueryBuilder<T, any>

function applyFillable<T>(data: Partial<T>, fillable?: string[]): Partial<T> {
    if (!fillable || fillable.length === 0) return data;
    return Object.keys(data)
        .filter(key => fillable.includes(key))
        .reduce((obj, key) => {
            obj[key as keyof T] = data[key as keyof T];
            return obj;
        }, {} as any);
}

export function createOerem(config: Knex.Config) {
    const connection = knex(config);

    return {
        connection,
        model: <T extends Record<string, any>>(tableName: string, options: Partial<ModelOptions> = {}) => {
            const pk = options.primaryKey || 'id';
            const deletedAt = options.deletedAtColumn || 'deleted_at';

            // Fungsi internal untuk membuat instance query baru agar tidak tabrakan
            const createBuilder = (queryInstance: Knex.QueryBuilder<T, any>) => {
                let currentQuery = queryInstance;

                return {
                    with() { return this; },

                    query(callback: QueryCallback<T>) {
                        currentQuery = callback(currentQuery);
                        return this;
                    },

                    async get(): Promise<T[]> {
                        if (options.softDelete) {
                            currentQuery.whereNull(deletedAt);
                        }
                        return await currentQuery as T[];
                    },

                    // Method aksi (Final Actions)
                    async find(id: number | string): Promise<T | undefined> {
                        return currentQuery.where(pk, id).first();
                    },

                    async create(data: Partial<T>): Promise<T> {
                        const filtered = applyFillable(data, options.fillable);
                        const payload: any = { ...filtered };

                        if (options.timestamps !== false) {
                            const now = connection.fn.now();
                            payload.created_at = payload.created_at || now;
                            payload.updated_at = payload.updated_at || now;
                        }

                        const [insertedId] = await connection(tableName).insert(payload);
                        return { [pk]: data[pk as keyof T] || insertedId, ...payload } as unknown as T;
                    },

                    async update(id: number | string, data: Partial<T>): Promise<number> {
                        const filtered = applyFillable(data, options.fillable);
                        const payload: any = { ...filtered };
                        if (options.timestamps !== false) {
                            payload.updated_at = payload.updated_at || connection.fn.now();
                        }
                        return connection(tableName).where(pk, id).update(payload);
                    },

                    async softDelete(id: number | string): Promise<number> {
                        if (!options.softDelete) throw new Error("Soft delete disabled");
                        return connection(tableName).where(pk, id).update({ [deletedAt]: connection.fn.now() } as any);
                    }
                };
            };

            // Public Interface: Setiap akses ke method model akan memulai builder baru
            return {
                with() { return createBuilder(connection<T>(tableName)).with(); },
                query(cb: QueryCallback<T>) { return createBuilder(connection<T>(tableName)).query(cb); },
                all() { return createBuilder(connection<T>(tableName)).get(); },
                find(id: number | string) { return createBuilder(connection<T>(tableName)).find(id); },
                create(data: Partial<T>) { return createBuilder(connection<T>(tableName)).create(data); },
                update(id: number | string, data: Partial<T>) { return createBuilder(connection<T>(tableName)).update(id, data); },
                softDelete(id: number | string) { return createBuilder(connection<T>(tableName)).softDelete(id); }
            };
        },
        async close() { await connection.destroy(); }
    };
}