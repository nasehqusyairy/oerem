import { Knex } from "knex";
import { SelectBuilder } from "./select-builder";

// 1. State untuk Soft Delete (Internal Builder)
export type SoftDeleteMode = 'active' | 'with' | 'only';

export type RelationType = 'hasMany' | 'hasOne' | 'belongsTo' | 'belongsToMany';

// Ganti RelationConfig yang lama dengan versi tagged

// T = tipe target model
export interface HasMany<T extends Record<string, unknown>> {
    readonly _type: 'hasMany';
    modelThunk: () => Model<T, any>;
    foreignKey: string;
    localKey: string;
}

export interface HasOne<T extends Record<string, unknown>> {
    readonly _type: 'hasOne';
    modelThunk: () => Model<T, any>;
    foreignKey: string;
    localKey: string;
}

export interface BelongsTo<T extends Record<string, unknown>> {
    readonly _type: 'belongsTo';
    modelThunk: () => Model<T, any>;
    foreignKey: string;
    localKey: string;
}

export interface BelongsToMany<T extends Record<string, unknown>> {
    readonly _type: 'belongsToMany';
    modelThunk: () => Model<T, any>;
    pivotTable: string;
    foreignPivotKey: string;
    relatedPivotKey: string;
    localKey: string;
    foreignKey: string;
}

// Union untuk backward compat
export type RelationConfig =
    | HasMany<any>
    | HasOne<any>
    | BelongsTo<any>
    | BelongsToMany<any>;

// Ambil tipe "isi" dari array atau object
type Unwrap<T> =
    T extends (infer I)[] ? I :  // T[] → I
    T extends (infer I) | undefined ? I :  // T | undefined → I
    T;

// Dari value di U, tentukan RelationConfig yang valid
export type InferRelationConfig<V> =
    // Jika value adalah array → hasMany atau belongsToMany
    NonNullable<V> extends (infer Item)[]
    ? Item extends Record<string, unknown>
    ? HasMany<Item> | BelongsToMany<Item>
    : never
    // Jika value adalah object → hasOne atau belongsTo
    : NonNullable<V> extends Record<string, unknown>
    ? HasOne<NonNullable<V>> | BelongsTo<NonNullable<V>>
    : never;

// Map seluruh U menjadi konfigurasi relasi yang valid
export type RelationsMap<U extends Record<string, unknown>> = {
    [K in keyof U]-?: InferRelationConfig<U[K]>
};

export interface ModelOptions<T, U = {}> {
    primaryKey: keyof T | string;
    timestamps: boolean;
    softDelete: boolean;
    deletedAtColumn: string;
    fillable: (keyof T)[];
    guarded: (keyof T)[];
    hidden: (keyof T)[];
    relations: U extends Record<string, unknown>
    ? Partial<RelationsMap<U>>  // ← sekarang divalidasi per-key!
    : never;
}

// Helper untuk Autocomplete agar tidak collapsing
type LiteralUnion<T extends string> = T | (string & {});

export type TimeStampColumns = {
    created_at?: Date;
    updated_at?: Date;
}

export type SoftDeleteColumn = {
    deleted_at?: Date;
}

export type BelongsToManyColumn<T, P> = (T & { pivot?: P })[]

// --- CORE RELATION TYPES ---
export type WithCallback<
    T extends Record<string, unknown> = Record<string, unknown>,
    U extends Record<string, unknown> = Record<string, unknown>
> = (query: Builder<T, U>) => Builder<T, U> | unknown;

// Untuk with() map, gunakan any agar bisa ditimpa
export type AnyWithCallback = WithCallback<any, any>;

export type WithInput<U extends Record<string, unknown> = Record<string, unknown>> =
    | (keyof U & string)
    | (keyof U & string)[]
    | string
    | string[]
    | { [K in keyof U]?: AnyWithCallback }
    | { [K: string]: AnyWithCallback };

// --- BUILDER INTERFACE ---
// T = Model Utama, U = Definisi Relasi
export interface Builder<T extends Record<string, unknown>, U extends Record<string, unknown> = {}> {
    toSQL(): Knex.Sql;

    // Soft Delete
    withTrashed(): this;
    onlyTrashed(): this;

    // Eager Loading
    with(map: { [K in keyof U]?: AnyWithCallback }): this;
    with(dotNotation: string): this;
    with(...args: (WithInput<U> | string)[]): this;

    // Querying
    query(callback: (q: SelectBuilder<T>) => SelectBuilder<T>): this;

    // Execution (Return T & U untuk menggabungkan field asli + field relasi)
    get<R extends unknown = (T & U)>(): Promise<(R & Wrapper<U>)[]>;
    first<R = T & U>(): Promise<R | undefined>;

    // Persistence
    create(data: Partial<T>): Promise<T & Wrapper<U>>;
    update(data: Partial<T>): Promise<number>;
    delete(): Promise<number>;
    softDelete(): Promise<number>;
    insert(records: Partial<T>[]): Promise<void>;
}

// --- MODEL INSTANCE INTERFACE ---
export interface Model<T extends Record<string, unknown>, U extends Record<string, unknown> = {}> {
    tableName: string;

    with(relation: keyof U & string): Builder<T, U>;
    with(relations: (keyof U & string)[]): Builder<T, U>;
    with(map: { [K in keyof U]?: WithCallback<Record<string, unknown>, Record<string, unknown>> }): Builder<T, U>;
    with(dotNotation: string): Builder<T, U>;
    with(...args: (WithInput<U> | string)[]): Builder<T, U>;

    query(callback: (q: SelectBuilder<T>) => SelectBuilder<T>): Builder<T, U>;

    withTrashed(): Builder<T, U>;
    onlyTrashed(): Builder<T, U>;

    // Direct actions
    all(): Promise<(T & U & Wrapper<U>)[]>;
    find(id: number | string): Promise<(T & U & Wrapper<U>) | undefined>;
    create(data: Partial<T>): Promise<T & Wrapper<U>>;
    insert(records: Partial<T>[]): Promise<void>;
    update(id: number | string, data: Partial<T>): Promise<number>;
    delete(id: number | string): Promise<number>;
    softDelete(id: number | string): Promise<number>;
}


// Methods khusus belongsToMany
export type PivotMethods = {
    attach: (ids: (number | string)[]) => Promise<void>;
    detach: (ids: (number | string)[]) => Promise<void>;
    sync: (ids: (number | string)[]) => Promise<void>;
}

// Methods untuk relasi biasa (hasMany, hasOne, belongsTo)
export type RelatedMethods<T extends Record<string, unknown>> = {
    create: (data: Partial<T>) => Promise<T>;
    update: (data: Partial<T>) => Promise<number>;
    delete: () => Promise<number>;
    softDelete: () => Promise<number>;
    insert: (records: Partial<T>[]) => Promise<void>;
}

// Gabungan untuk belongsToMany
export type PivotRelatedMethods<T extends Record<string, unknown>> =
    RelatedMethods<T> & PivotMethods;

// Infer methods yang tersedia berdasarkan tipe relasi di U
type RelatedCallback<V> =
    // Array dengan pivot → belongsToMany → dapat PivotMethods
    NonNullable<V> extends (infer Item)[]
    ? Item extends { pivot?: any }
    ? (r: PivotRelatedMethods<Omit<Item, 'pivot'>>) => Promise<void> | void
    : (r: RelatedMethods<Item extends Record<string, unknown> ? Item : never>) => Promise<void> | void
    // Object tunggal → hasOne/belongsTo → hanya RelatedMethods
    : NonNullable<V> extends Record<string, unknown>
    ? (r: RelatedMethods<NonNullable<V>>) => Promise<void> | void
    : never;

// Map dari U ke callbacks
export type RelatedInput<U extends Record<string, unknown>> = {
    [K in keyof U]?: RelatedCallback<U[K]>
};

export type Wrapper<U extends Record<string, unknown>> = {
    related(input: RelatedInput<U>): Promise<void>;
}

export type InferModel<M> = M extends Model<infer T, infer U>
    ? { instance: Model<T, U>; builder: Builder<T, U> }
    : never;