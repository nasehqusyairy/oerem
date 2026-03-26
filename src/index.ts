import knex, { Knex } from "knex";
import { OeremQuery } from "./oerem-query";

// Aturan untuk setiap model
type ModelOptions = {
    fillable: string[];
    primaryKey: string;
    softDelete: boolean;
    deletedAtColumn: string;
    timestamps: boolean
}

type QueryCallback<T extends {}> = (q: OeremQuery<T>) => OeremQuery<T>;

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

            const createBuilder = (queryInstance: Knex.QueryBuilder<T, any>) => {
                let currentQuery = queryInstance as unknown as OeremQuery<T>;

                return {
                    with() { return this; },

                    query(callback: QueryCallback<T>) {
                        currentQuery = callback(currentQuery);
                        return this;
                    },

                    // --- QUERY SELECT ---
                    async get(): Promise<T[]> {
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

                        if (options.softDelete) {
                            currentQuery.whereNull(deletedAt);
                        }

                        return await (currentQuery as unknown as Promise<T[]>);
                    },

                    async first(): Promise<T | undefined> {
                        if (options.softDelete) {
                            currentQuery.whereNull(deletedAt);
                        }
                        return (currentQuery as unknown as Knex.QueryBuilder<T, any>).first();
                    },

                    async find(id: number | string): Promise<T | undefined> {
                        return (currentQuery.where(pk, id) as unknown as Knex.QueryBuilder<T, any>).first();
                    },

                    // --- QUERY PERSISTENCE (INSERT) ---
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

                    async update(data: Partial<T>) {
                        const filtered = applyFillable(data, options.fillable);
                        const payload: any = { ...filtered };
                        if (options.timestamps !== false) {
                            payload.updated_at = payload.updated_at || connection.fn.now();
                        }
                        return (currentQuery as unknown as Knex.QueryBuilder<T, any>).update(payload);
                    },
                    async delete() {
                        return (currentQuery as unknown as Knex.QueryBuilder<T, any>).del();
                    },
                    async softDelete() {
                        if (!options.softDelete) throw new Error("Soft delete disabled");
                        return (currentQuery as unknown as Knex.QueryBuilder<T, any>).update({ [deletedAt]: connection.fn.now() } as any);
                    }
                };
            };

            return {
                with() { return createBuilder(connection<T>(tableName)).with(); },
                query(cb: QueryCallback<T>) { return createBuilder(connection<T>(tableName)).query(cb); },
                all() { return createBuilder(connection<T>(tableName)).get(); },
                find(id: number | string) { return createBuilder(connection<T>(tableName)).find(id); },
                create(data: Partial<T>) { return createBuilder(connection<T>(tableName)).create(data); },
                update(id: number | string, data: Partial<T>) {
                    return createBuilder(connection<T>(tableName)).query(q => q.where(pk, id)).update(data);
                },
                delete(id: number | string) {
                    return createBuilder(connection<T>(tableName)).query(q => q.where(pk, id)).delete();
                },
                softDelete(id: number | string) {
                    return createBuilder(connection<T>(tableName)).query(q => q.where(pk, id)).softDelete();
                }
            };
        },
        async close() { await connection.destroy(); }
    };
}