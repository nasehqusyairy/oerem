import { OeremQuery } from "./oerem-query";

// 1. Konfigurasi Utama Model
export interface ModelOptions<T extends {}> {
    fillable: (keyof T)[];
    guarded: (keyof T)[];
    hidden: (keyof T)[];
    primaryKey: (keyof T);
    softDelete: boolean;
    deletedAtColumn: (keyof T);
    timestamps: boolean;
}

// 2. Type untuk Callback Query
export type QueryCallback<T extends {}> = (q: OeremQuery<T>) => OeremQuery<T>;

// 3. State untuk Soft Delete (Internal Builder)
export type SoftDeleteMode = 'active' | 'with' | 'only';