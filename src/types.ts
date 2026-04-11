import { OeremQuery } from "./oerem-query";

// 1. Konfigurasi Utama Model
// export interface ModelOptions<T extends {}, R extends Record<string, any> = {}> {
//     fillable: (keyof T)[];
//     guarded: (keyof T)[];
//     hidden: (keyof T)[];
//     primaryKey: (keyof T);
//     softDelete: boolean;
//     deletedAtColumn: (keyof T);
//     timestamps: boolean;
//     relations?: Record<keyof R, RelationConfig>;
// }

// 2. Type untuk Callback Query
export type QueryCallback<T extends {}> = (q: OeremQuery<T>) => OeremQuery<T>;

// 3. State untuk Soft Delete (Internal Builder)
export type SoftDeleteMode = 'active' | 'with' | 'only';

// src/types.ts

export type RelationType = 'hasMany' | 'hasOne' | 'belongsTo';

export interface RelationConfig {
    type: RelationType;
    modelThunk: () => any; // Fungsi () => Post
    foreignKey: string;
    localKey?: string;
}

// Helper untuk builder .with()
// export type WithCallback = (query: any) => any

// Helper untuk Autocomplete agar tidak collapsing
type LiteralUnion<T extends string> = T | (string & {});

// export type WithInput<T extends Record<string, any> = {}> =
//     | LiteralUnion<keyof T & string>           // Autocomplete key model (posts, profile, dll)
//     | (keyof T & string)[]                     // Array of keys ['posts', 'profile']
//     | string[]                                 // Array of strings (untuk dot notation) ['posts.comments']
//     | { [K in keyof T]?: WithCallback }        // Mapping object { posts: (q) => ... }
//     | { [K: string]: WithCallback };           // Fallback untuk string umum (dot notation di key)

export type TimeStampColumns = {
    created_at?: Date;
    updated_at?: Date;
}

export type SoftDeleteColumn = {
    deleted_at?: Date;
}
// --- UTILITY TYPES ---

// --- CORE RELATION TYPES ---
export type WithCallback<T extends Record<string, any> = any, U extends Record<string, any> = any> =
    (query: OeremBuilder<T, U>) => OeremBuilder<T, U> | any;

export type WithInput<U extends Record<string, any> = {}> =
    | LiteralUnion<keyof U & string>
    | (keyof U & string)[]
    | string[] // Untuk dot notation 'posts.comments'
    | { [K in keyof U]?: WithCallback<any, any> }
    | { [K: string]: WithCallback<any, any> };

// --- BUILDER INTERFACE ---
// T = Model Utama, U = Definisi Relasi
export interface OeremBuilder<T extends Record<string, any>, U extends Record<string, any> = {}> {
    toSQL(): any

    // Soft Delete
    withTrashed(): this;
    onlyTrashed(): this;

    // Eager Loading
    // 1. Autocomplete untuk satu key (User.with('posts'))
    with(relation: keyof U & string): this;

    // 2. Autocomplete untuk array of keys (User.with(['posts', 'profile']))
    with(relations: (keyof U & string)[]): this;

    // 3. Autocomplete untuk objek mapping (User.with({ posts: (q) => ... }))
    with(map: { [K in keyof U]?: WithCallback<any, any> }): this;

    // 4. Fallback untuk string bebas/dot notation (User.with('posts.comments'))
    // Ini diletakkan paling bawah agar tidak merusak autocomplete di atas
    with(dotNotation: string): this;

    // 5. Support untuk banyak argumen sekaligus
    with(...args: any[]): this;

    // Querying
    query(callback: (query: OeremQuery<T>) => OeremQuery<T>): this;

    // Execution (Return T & U untuk menggabungkan field asli + field relasi)
    get<R extends any[] = (T & U)[]>(): Promise<R>;
    first<R extends {} = T & U>(): Promise<R | undefined>;

    // Persistence
    create(data: Partial<T>): Promise<T>;
    update(data: Partial<T>): Promise<number>;
    delete(): Promise<number>;
    softDelete(): Promise<number>;
    insert(records: Partial<T>[]): Promise<void>;
}

// --- MODEL INSTANCE INTERFACE ---
export interface OeremModel<T extends Record<string, any>, U extends Record<string, any> = {}> {

    // Entry points yang menghasilkan Builder
    // 1. Autocomplete untuk satu key (User.with('posts'))
    with(relation: keyof U & string): OeremBuilder<T, U>;

    // 2. Autocomplete untuk array of keys (User.with(['posts', 'profile']))
    with(relations: (keyof U & string)[]): OeremBuilder<T, U>;

    // 3. Autocomplete untuk objek mapping (User.with({ posts: (q) => ... }))
    with(map: { [K in keyof U]?: WithCallback<any, any> }): OeremBuilder<T, U>;

    // 4. Fallback untuk string bebas/dot notation (User.with('posts.comments'))
    // Ini diletakkan paling bawah agar tidak merusak autocomplete di atas
    with(dotNotation: string): OeremBuilder<T, U>;

    // 5. Support untuk banyak argumen sekaligus
    with(...args: any[]): OeremBuilder<T, U>;

    query(cb: (query: OeremQuery<T>) => OeremQuery<T>): OeremBuilder<T, U>;
    withTrashed(): OeremBuilder<T, U>;
    onlyTrashed(): OeremBuilder<T, U>;

    // Direct actions
    all(): Promise<(T & U)[]>;
    find(id: number | string): Promise<(T & U) | undefined>;
    create(data: Partial<T>): Promise<T>;
    insert(records: Partial<T>[]): Promise<void>;
    update(id: number | string, data: Partial<T>): Promise<number>;
    delete(id: number | string): Promise<number>;
    softDelete(id: number | string): Promise<number>;
}

// --- OPTIONS INTERFACE ---
export interface ModelOptions<T, U = {}> {
    primaryKey: keyof T | string;
    timestamps: boolean;
    softDelete: boolean;
    deletedAtColumn: string;
    fillable: (keyof T)[];
    guarded: (keyof T)[];
    hidden: (keyof T)[];
    relations: Record<keyof U, any>; // hasMany, belongsTo, dll
}