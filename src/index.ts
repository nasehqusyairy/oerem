export * from './types';

import knex, { Knex } from "knex";
import { OeremQuery } from "./oerem-query";
import { executeGet } from "./executor";
import { ModelOptions, OeremBuilder, OeremModel, QueryCallback, SoftDeleteMode, WithInput } from "./types";
import { applySecurity, controlOutput } from "./helper";
import { ModelRegistry } from './registry';

const model = (connection: knex.Knex<any, unknown[]>) => <T extends Record<string, any>, U extends Record<string, any> = {}>(tableName: string, options: Partial<ModelOptions<T, U>> = {}): OeremModel<T, U> => {
    const pk = (options.primaryKey || 'id') as string;
    const deletedAt = options.deletedAtColumn || 'deleted_at';

    const createBuilder = (queryInstance: Knex.QueryBuilder<T, any>): OeremBuilder<T, U> => {
        // Antrean relasi yang akan diambil
        let withRelations: WithInput[] = [];

        // let currentQuery = queryInstance as unknown as OeremQuery<T>;
        let currentQuery = queryInstance as unknown as OeremQuery<T>;

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

            with(...args: WithInput<U>[]) {
                // console.log({ outerargs: args });

                withRelations.push(...args);

                // console.log({ outerwith: withRelations });

                return this;
            },

            query(callback: QueryCallback<T>) {
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
                    withRelations
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
                    const now = connection.fn.now();
                    payload.created_at = payload.created_at || now;
                    payload.updated_at = payload.updated_at || now;
                }

                const [insertedId] = await connection(tableName).insert(payload);
                return { [pk]: data[pk as keyof T] || insertedId, ...payload } as unknown as T;
            },

            async update(data: Partial<T>) {
                const filtered = applySecurity(data, options);
                const payload: any = { ...filtered };
                if (options.timestamps !== false) {
                    payload.updated_at = payload.updated_at || connection.fn.now();
                }
                return (currentQuery as unknown as Knex.QueryBuilder<T, any>).update(payload);
            },

            // --- BATCH PERSISTENCE ---
            async insert(records: Partial<T>[]): Promise<void> {
                const payloads = records.map(data => {
                    const filtered = applySecurity(data, options);
                    const payload: any = { ...filtered };
                    if (options.timestamps !== false) {
                        const now = connection.fn.now();
                        payload.created_at = payload.created_at || now;
                        payload.updated_at = payload.updated_at || now;
                    }
                    return payload;
                });

                // Menggunakan insert array untuk batch
                await connection(tableName).insert(payloads);
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

    const instance = {
        with(...args: WithInput<U>[]) {
            return createBuilder(connection<T>(tableName)).with(...args);
        },
        query(cb: QueryCallback<T>) {
            return createBuilder(connection<T>(tableName)).query(cb);
        },
        all() {
            return createBuilder(connection<T>(tableName)).get();
        },
        find(id: number | string) {
            return createBuilder(connection<T>(tableName)).query(q => q.where(pk, id)).first();
        },
        withTrashed() {
            return createBuilder(connection<T>(tableName)).withTrashed();
        },
        onlyTrashed() {
            return createBuilder(connection<T>(tableName)).onlyTrashed();
        },
        create(data: Partial<T>) {
            return createBuilder(connection<T>(tableName)).create(data);
        },
        insert(records: Partial<T>[]) {
            return createBuilder(connection<T>(tableName)).insert(records);
        },
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

    ModelRegistry.register(tableName, instance)

    return instance
}

// export type ModelInstance<T extends Record<string, any>, U extends Record<string, any>> = ReturnType<typeof model> extends (tableName: string, options?: Partial<ModelOptions<T, U>>) => infer R ? R : never;

export function createOerem(config: Knex.Config) {
    const connection = knex(config);

    return {
        connection,
        raw: connection.raw.bind(connection),
        model: model(connection),
        async close() { await connection.destroy(); }
    };
}
