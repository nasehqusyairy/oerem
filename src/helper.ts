import { BelongsTo, BelongsToMany, HasMany, HasOne, ModelOptions, Model, RelationConfig } from "./types";

export function applySecurity<T extends Record<string, unknown>>(
    data: Partial<T>,
    options: Partial<ModelOptions<T>>
): Partial<T> {
    const keys = Object.keys(data);

    // 1. Cek Guarded: Jika ada key yang dilarang, langsung lempar error
    if (options.guarded && options.guarded.length > 0) {
        const forbidden = keys.filter(key => options.guarded!.includes(key));
        if (forbidden.length > 0) {
            throw new Error(
                `Oerem Security Error: Cannot write to guarded field(s): [${forbidden.join(', ')}]`
            );
        }
    }

    // 2. Cek Fillable: Jika fillable didefinisikan, pastikan HANYA yang ada di sana yang dikirim
    if (options.fillable && options.fillable.length > 0) {
        const unknownKeys = keys.filter(key => !options.fillable!.includes(key));

        if (unknownKeys.length > 0) {
            throw new Error(
                `Oerem Security Error: Field(s) [${unknownKeys.join(', ')}] are not in fillable list.`
            );
        }

        // Karena sudah divalidasi tidak ada field asing, kita bisa return datanya
        return data;
    }

    return data;
}

export function applyHidden<T extends Record<string, unknown>[]>(
    results: T,
    hidden: string[]
) {
    return results.map(row => {
        const cleanRow = { ...row };
        hidden.forEach(key => delete cleanRow[key]);
        return cleanRow;
    }) as T
}

export function controlOutput<R extends unknown[], T extends Record<string, unknown>>(
    results: R,
    options: Partial<ModelOptions<T>>
): R {
    // --- Hidden Attributes Logic ---
    if (options.hidden && options.hidden.length > 0) {
        return applyHidden(results as Record<string, unknown>[], options.hidden as string[]) as unknown as R;
    }

    return results;
}

// Sekarang setiap helper return tipe yang spesifik
export const hasMany = <T extends Record<string, unknown>>(
    modelThunk: () => Model<T, any>,
    foreignKey: string,
    localKey = 'id'
): HasMany<T> => ({
    _type: 'hasMany', // phantom, tidak pernah digunakan runtime
    modelThunk,
    foreignKey,
    localKey,
});

export const hasOne = <T extends Record<string, unknown>>(
    modelThunk: () => Model<T, any>,
    foreignKey: string,
    localKey = 'id'
): HasOne<T> => ({
    _type: 'hasOne',
    modelThunk,
    foreignKey,
    localKey,
});

export const belongsTo = <T extends Record<string, unknown>>(
    modelThunk: () => Model<T, any>,
    foreignKey: string,
    ownerKey = 'id'
): BelongsTo<T> => ({
    _type: 'belongsTo',
    modelThunk,
    foreignKey,
    localKey: ownerKey,
});

export const belongsToMany = <T extends Record<string, unknown>>(
    modelThunk: () => Model<T, any>,
    pivotTable: string,
    foreignPivotKey: string,
    relatedPivotKey: string,
    parentKey = 'id',
    foreignKey = 'id'
): BelongsToMany<T> => ({
    _type: 'belongsToMany',
    modelThunk,
    pivotTable,
    foreignPivotKey,
    relatedPivotKey,
    localKey: parentKey,
    foreignKey,
});