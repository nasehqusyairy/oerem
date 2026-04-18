import { Knex } from "knex";
import { SelectBuilder } from "./select-builder";

// ============================================================
// SOFT DELETE
// ============================================================
export type SoftDeleteMode = 'active' | 'with' | 'only';

// ============================================================
// RELATION CONFIGS — tagged agar bisa dibedakan di InferRelations
// T = schema target, R = relasi target (agar ModelShape bisa rekursif)
// ============================================================
export interface HasMany<T extends Record<string, unknown>, R extends Record<string, unknown> = {}> {
    readonly _type: 'hasMany';
    modelThunk: () => Model<T, R>;
    foreignKey: string;
    localKey: string;
}

export interface HasOne<T extends Record<string, unknown>, R extends Record<string, unknown> = {}> {
    readonly _type: 'hasOne';
    modelThunk: () => Model<T, R>;
    foreignKey: string;
    localKey: string;
}

export interface BelongsTo<T extends Record<string, unknown>, R extends Record<string, unknown> = {}> {
    readonly _type: 'belongsTo';
    modelThunk: () => Model<T, R>;
    foreignKey: string;
    localKey: string;
}

export interface BelongsToMany<T extends Record<string, unknown>, R extends Record<string, unknown> = {}> {
    readonly _type: 'belongsToMany';
    modelThunk: () => Model<T, R>;
    pivotTable: string;
    foreignPivotKey: string;
    relatedPivotKey: string;
    localKey: string;
    foreignKey: string;
}

// Union — pakai any agar bisa dipakai sebagai constraint tanpa harus specify T & R
export type AnyRelationConfig =
    | HasMany<any, any>
    | HasOne<any, any>
    | BelongsTo<any, any>
    | BelongsToMany<any, any>;

// ============================================================
// MODEL OPTIONS & CONFIG
// ============================================================
export interface ModelOptions<T> {
    primaryKey?: keyof T | string;
    timestamps?: boolean;
    softDelete?: boolean;
    deletedAtColumn?: string;
    fillable?: (keyof T)[];
    guarded?: (keyof T)[];
    hidden?: (keyof T)[];
}

// R diinfer dari isi relations — tidak perlu ditulis manual
export type ModelConfig<T, R extends Record<string, AnyRelationConfig> = {}> =
    ModelOptions<T> & {
        relations?: R;
    };

// ============================================================
// INFER HELPERS
// ============================================================

// Ambil T & U sekaligus dari Model<T, U> — untuk result relasi yang lengkap
export type ModelShape<M> = M extends Model<infer T, infer U>
    ? T & U
    : never;

// Dari konfigurasi relations R, hasilkan shape U yang akan jadi parameter kedua Model
export type InferRelations<R extends Record<string, AnyRelationConfig>> = {
    [K in keyof R]:
    R[K] extends HasMany<any, any> ? ModelShape<ReturnType<R[K]['modelThunk']>>[] :
    R[K] extends BelongsToMany<any, any> ? ModelShape<ReturnType<R[K]['modelThunk']>>[] :
    R[K] extends HasOne<any, any> ? ModelShape<ReturnType<R[K]['modelThunk']>> | null :
    R[K] extends BelongsTo<any, any> ? ModelShape<ReturnType<R[K]['modelThunk']>> | null :
    never
};

// Ekstrak schema murni T dari Model<T, U> — untuk keperluan lain
export type ExtractSchema<M> = M extends Model<infer T, any> ? T : never;

// ============================================================
// MISC HELPERS
// ============================================================
type LiteralUnion<T extends string> = T | (string & {});

export type TimeStampColumns = {
    created_at?: Date;
    updated_at?: Date;
}

export type SoftDeleteColumn = {
    deleted_at?: Date;
}

export type BelongsToManyColumn<T, P> = (T & { pivot?: P })[]

// ============================================================
// WITH / EAGER LOADING
// ============================================================
export type WithCallback<
    T extends Record<string, unknown> = Record<string, unknown>,
    U extends Record<string, unknown> = Record<string, unknown>
> = (query: Builder<T, U>) => Builder<T, U> | unknown;

export type AnyWithCallback = WithCallback<any, any>;

export type WithInput<U extends Record<string, unknown> = Record<string, unknown>> =
    | (keyof U & string)
    | (keyof U & string)[]
    | string
    | string[]
    | { [K in keyof U]?: AnyWithCallback }
    | { [K: string]: AnyWithCallback };

// ============================================================
// RELATED — untuk operasi relasi (attach, detach, create, dll)
// ============================================================
export type PivotMethods = {
    attach: (ids: (number | string)[]) => Promise<void>;
    detach: (ids: (number | string)[]) => Promise<void>;
    sync: (ids: (number | string)[]) => Promise<void>;
}

export type RelatedMethods<T extends Record<string, unknown>> = {
    create: (data: Partial<T>) => Promise<T>;
    update: (data: Partial<T>) => Promise<number>;
    delete: () => Promise<number>;
    softDelete: () => Promise<number>;
    insert: (records: Partial<T>[]) => Promise<void>;
}

export type PivotRelatedMethods<T extends Record<string, unknown>> =
    RelatedMethods<T> & PivotMethods;

// Deteksi dari tagged type — bukan dari shape U
type RelatedCallback<V> =
    V extends HasMany<infer T, any>
    ? (r: RelatedMethods<T>) => Promise<void> | void
    : V extends BelongsToMany<infer T, any>
    ? (r: PivotRelatedMethods<T>) => Promise<void> | void
    : V extends HasOne<infer T, any>
    ? (r: RelatedMethods<T>) => Promise<void> | void
    : V extends BelongsTo<infer T, any>
    ? (r: RelatedMethods<T>) => Promise<void> | void
    : never;

// R di sini adalah Record<string, AnyRelationConfig> — bukan U
export type RelatedInput<R extends Record<string, AnyRelationConfig>> = {
    [K in keyof R]?: RelatedCallback<R[K]>
};

// ============================================================
// BUILDER INTERFACE
// T = schema utama, U = shape relasi (hasil InferRelations)
// ============================================================
export interface Builder<T extends Record<string, unknown>, U extends Record<string, unknown> = {}> {
    toSQL(): Knex.Sql;

    withTrashed(): this;
    onlyTrashed(): this;

    with(map: { [K in keyof U]?: AnyWithCallback }): this;
    with(dotNotation: string): this;
    with(...args: (WithInput<U> | string)[]): this;

    query(callback: (q: SelectBuilder<T>) => SelectBuilder<T>): this;

    // Return T & U — relasi sudah termuat di U
    get(): Promise<(T & U)[]>;
    first(): Promise<(T & U) | undefined>;

    create(data: Partial<T>): Promise<T>;
    update(data: Partial<T>): Promise<number>;
    delete(): Promise<number>;
    softDelete(): Promise<number>;
    insert(records: Partial<T>[]): Promise<void>;
}

// ============================================================
// MODEL INTERFACE
// T = schema utama, U = shape relasi (hasil InferRelations)
// R = konfigurasi relasi mentah (untuk related())
// ============================================================
export interface Model<
    T extends Record<string, unknown>,
    U extends Record<string, unknown> = {},
    R extends Record<string, AnyRelationConfig> = {}
> {
    tableName: string;

    with(map: { [K in keyof U]?: AnyWithCallback }): Builder<T, U>;
    with(dotNotation: string): Builder<T, U>;
    with(...args: (WithInput<U> | string)[]): Builder<T, U>;

    query(callback: (q: SelectBuilder<T>) => SelectBuilder<T>): Builder<T, U>;

    withTrashed(): Builder<T, U>;
    onlyTrashed(): Builder<T, U>;

    all(): Promise<(T & U)[]>;
    find(id: number | string): Promise<(T & U) | undefined>;
    create(data: Partial<T>): Promise<T>;
    insert(records: Partial<T>[]): Promise<void>;
    update(id: number | string, data: Partial<T>): Promise<number>;
    delete(id: number | string): Promise<number>;
    softDelete(id: number | string): Promise<number>;

    // related() menggunakan R (config mentah) agar bisa deteksi tagged type
    related(input: RelatedInput<R>): Promise<void>;
}

// ============================================================
// UTILITY TYPES
// ============================================================
export type InferModel<M> = M extends Model<infer T, infer U, any>
    ? { instance: Model<T, U>; builder: Builder<T, U> }
    : never;