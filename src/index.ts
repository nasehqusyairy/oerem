export * from './types';

import { AsyncLocalStorage } from 'async_hooks';
import knex, { Knex } from "knex";
import { executeGet, wrapOutput } from "./executor";
import {
    ModelOptions,
    Builder,
    Model,
    SoftDeleteMode,
    WithInput,
    // Wrapper,
    AnyRelationConfig,
    ModelConfig,
    InferRelations
} from "./types";
import { applySecurity, controlOutput } from "./helper";
import { ModelRegistry } from './registry';
import { SelectBuilder } from './select-builder';

const model = (getConnection: () => Knex) =>
    <T extends Record<string, unknown>>() =>
        <R extends Record<string, AnyRelationConfig> = {}>(
            tableName: string,
            options: ModelConfig<T, R> = {}
        ): Model<T, InferRelations<R>> => {

            const pk = (options.primaryKey || 'id') as string;
            const deletedAt = options.deletedAtColumn || 'deleted_at';

            const createBuilder = (modelInstance: Model<T, InferRelations<R>>, queryInstance: Knex.QueryBuilder<T, unknown[]>): Builder<T, InferRelations<R>> => {

                // Antrean relasi yang akan diambil
                let withRelations: (WithInput<InferRelations<R>> | string)[] = [];
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
                        withRelations.push(...args);
                        return this;
                    },

                    query(callback) {
                        callback(currentQuery as unknown as SelectBuilder<T>);
                        return this;
                    },

                    toSQL() {
                        return currentQuery.toSQL()
                    },

                    // --- QUERY SELECT ---
                    async get<N extends unknown = (T & InferRelations<R>)>(): Promise<(N)[]> {
                        return await executeGet<N, T>(
                            currentQuery,
                            options,
                            tableName,
                            deletedAt as string,
                            softDeleteMode,
                            withRelations as WithInput[],
                            getConnection
                        );
                    },

                    async first<N extends unknown = (T & InferRelations<R>)>(): Promise<N | undefined> {
                        if (options.softDelete) {
                            currentQuery.whereNull(deletedAt);
                        }

                        const results = await this.get()

                        return controlOutput([results[0]], options)[0] as N | undefined;
                    },

                    // --- QUERY PERSISTENCE (INSERT) ---
                    async create(data: Partial<T>): Promise<T> {
                        const filtered = applySecurity(data, options);
                        const payload = { ...filtered } as Record<string, unknown>;

                        if (options.timestamps !== false) {
                            const now = getConnection().fn.now();
                            payload.created_at = payload.created_at || now;
                            payload.updated_at = payload.updated_at || now;
                        }

                        const [insertedId] = await getConnection()(tableName).insert(payload);
                        const results = [{ [pk]: data[pk as keyof T] || insertedId, ...payload } as unknown as T];
                        wrapOutput(results, options, getConnection);

                        return results[0] as T;
                    },

                    async update(data: Partial<T>) {
                        const filtered = applySecurity(data, options);
                        const payload = { ...filtered } as Record<string, unknown>;
                        if (options.timestamps !== false) {
                            payload.updated_at = payload.updated_at || getConnection().fn.now();
                        }
                        return currentQuery.update(payload as never) as unknown as Promise<number>;
                    },

                    // --- BATCH PERSISTENCE ---
                    async insert(records: Partial<T>[]): Promise<void> {
                        const payloads = records.map(data => {
                            const filtered = applySecurity(data, options);
                            const payload = { ...filtered } as Record<string, unknown>;
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
                        return currentQuery.del() as unknown as Promise<number>;
                    },
                    async softDelete() {
                        if (!options.softDelete) throw new Error("Soft delete disabled");
                        return currentQuery.update({ [deletedAt]: getConnection().fn.now() } as never) as unknown as Promise<number>;
                    }
                };
            };

            const instance: Model<T, InferRelations<R>> = {
                tableName,
                with(...args) {
                    return createBuilder(this, getConnection()<T>(tableName)).with(...args);
                },
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

            ModelRegistry.register(tableName, instance as unknown as Model<Record<string, unknown>, Record<string, unknown>>)

            return instance
        }

export function createPool(config: Knex.Config) {
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

export type PoolInstance = ReturnType<typeof createPool>;
