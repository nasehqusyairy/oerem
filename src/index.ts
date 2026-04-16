export * from './types';

import { AsyncLocalStorage } from 'async_hooks';
import knex, { Knex } from "knex";
// import { OeremQuery } from "./oerem-query";
import { executeGet, wrapOutput } from "./executor";
import {
    ModelOptions,
    OeremBuilder,
    OeremModel,
    // QueryCallback,
    SoftDeleteMode,
    WithInput
} from "./types";
import { applySecurity, controlOutput } from "./helper";
import { ModelRegistry } from './registry';

const model = (getConnection: () => knex.Knex<any, unknown[]>) => <T extends Record<string, any>, U extends Record<string, any> = {}>(tableName: string, options: Partial<ModelOptions<T, U>> = {}): OeremModel<T, U> => {
    const pk = (options.primaryKey || 'id') as string;
    const deletedAt = options.deletedAtColumn || 'deleted_at';

    const createBuilder = (modelInstance: OeremModel<T, U>, queryInstance: Knex.QueryBuilder<T, any>): OeremBuilder<T, U> => {

        // Antrean relasi yang akan diambil
        let withRelations: WithInput[] = [];
        let currentQuery = queryInstance;

        let softDeleteMode: SoftDeleteMode = 'active';

        return {
            // --- SOFT DELETE MODIFIERS ---
            withTrashed() {
                softDeleteMode = 'with';
                return this;
            },

            onlyTrashed() {
                softDeleteMode = 'only';
                return this;
            },

            with(...args) {
                // console.log({ outerargs: args });

                withRelations.push(...args);

                // console.log({ outerwith: withRelations });

                return this;
            },

            query(callback) {
                // currentQuery = callback(currentQuery);
                callback(currentQuery);
                return this;
            },

            toSQL() {
                return (currentQuery as any).toSQL()
            },

            // --- QUERY SELECT ---
            async get<R extends any[] = (T & U)[]>(): Promise<R> {
                return await executeGet<R, T>(
                    currentQuery as any,
                    options,
                    tableName,
                    deletedAt as string,
                    softDeleteMode,
                    withRelations,
                    getConnection
                );
            },

            async first<R extends {} = T & U>(): Promise<R | undefined> {
                if (options.softDelete) {
                    currentQuery.whereNull(deletedAt);
                }

                const results = await this.get<R[]>()

                return controlOutput([results[0]], options)[0]
            },

            // --- QUERY PERSISTENCE (INSERT) ---
            async create(data: Partial<T>): Promise<T> {
                const filtered = applySecurity(data, options);
                const payload: any = { ...filtered };

                if (options.timestamps !== false) {
                    const now = getConnection().fn.now();
                    payload.created_at = payload.created_at || now;
                    payload.updated_at = payload.updated_at || now;
                }

                const [insertedId] = await getConnection()(tableName).insert(payload);
                const results = [{ [pk]: data[pk as keyof T] || insertedId, ...payload } as unknown as T];
                wrapOutput(results, options, getConnection);

                return results[0];
            },

            async update(data: Partial<T>) {
                const filtered = applySecurity(data, options);
                const payload: any = { ...filtered };
                if (options.timestamps !== false) {
                    payload.updated_at = payload.updated_at || getConnection().fn.now();
                }
                return (currentQuery as unknown as Knex.QueryBuilder<T, any>).update(payload);
            },

            // --- BATCH PERSISTENCE ---
            async insert(records: Partial<T>[]): Promise<void> {
                const payloads = records.map(data => {
                    const filtered = applySecurity(data, options);
                    const payload: any = { ...filtered };
                    if (options.timestamps !== false) {
                        const now = getConnection().fn.now();
                        payload.created_at = payload.created_at || now;
                        payload.updated_at = payload.updated_at || now;
                    }
                    return payload;
                });

                // Menggunakan insert array untuk batch
                await getConnection()(tableName).insert(payloads);
            },

            async delete() {
                return (currentQuery as unknown as Knex.QueryBuilder<T, any>).del();
            },
            async softDelete() {
                if (!options.softDelete) throw new Error("Soft delete disabled");
                return (currentQuery as unknown as Knex.QueryBuilder<T, any>).update({ [deletedAt]: getConnection().fn.now() } as any);
            }
        };
    };

    const instance: OeremModel<T, U> = {
        tableName,
        with(...args) {
            return createBuilder(this, getConnection()<T>(tableName)).with(...args);
        },
        // query(cb: QueryCallback<T>) {
        query(cb) {
            return createBuilder(this, getConnection()<T>(tableName)).query(cb);
        },
        all() {
            return createBuilder(this, getConnection()<T>(tableName)).get();
        },
        find(id) {
            return createBuilder(this, getConnection()<T>(tableName)).query(q => q.where(pk, id)).first();
        },
        withTrashed() {
            return createBuilder(this, getConnection()<T>(tableName)).withTrashed();
        },
        onlyTrashed() {
            return createBuilder(this, getConnection()<T>(tableName)).onlyTrashed();
        },
        create(data) {
            return createBuilder(this, getConnection()<T>(tableName)).create(data);
        },
        insert(records) {
            return createBuilder(this, getConnection()<T>(tableName)).insert(records);
        },
        update(id, data) {
            return createBuilder(this, getConnection()<T>(tableName)).query(q => q.where(pk, id)).update(data);
        },
        delete(id) {
            return createBuilder(this, getConnection()<T>(tableName)).query(q => q.where(pk, id)).delete();
        },
        softDelete(id) {
            return createBuilder(this, getConnection()<T>(tableName)).query(q => q.where(pk, id)).softDelete();
        }
    };

    ModelRegistry.register(tableName, instance)

    return instance
}

// export type ModelInstance<T extends Record<string, any>, U extends Record<string, any>> = ReturnType<typeof model> extends (tableName: string, options?: Partial<ModelOptions<T, U>>) => infer R ? R : never;
export function createOerem(config: Knex.Config) {
    const connection = knex(config);

    const trxStore = new AsyncLocalStorage<Knex.Transaction>();
    const getConnection = () => trxStore.getStore() || connection;


    return {
        getConnection,
        async transaction<T>(callback: () => Promise<T>) {
            return connection.transaction(async (trx) => {
                return await trxStore.run(trx, callback);
            })
        },
        model: model(getConnection),
        async close() { await connection.destroy(); }
    };
}

export type OeremInstance = ReturnType<typeof createOerem>;
