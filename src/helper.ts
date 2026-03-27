import { ModelOptions } from "./types";

export function applySecurity<T extends Record<string, any>>(
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
        const unknown = keys.filter(key => !options.fillable!.includes(key));

        if (unknown.length > 0) {
            throw new Error(
                `Oerem Security Error: Field(s) [${unknown.join(', ')}] are not in fillable list.`
            );
        }

        // Karena sudah divalidasi tidak ada field asing, kita bisa return datanya
        return data;
    }

    return data;
}

export function applyHidden<T extends Record<string, any>[]>(
    results: T,
    hidden: string[]
) {
    return results.map(row => {
        const cleanRow = { ...row };
        hidden.forEach(key => delete cleanRow[key]);
        return cleanRow;
    }) as T
}

export function controlOutput<R extends Record<string, any>[], T extends {}>(
    results: R,
    options: Partial<ModelOptions<T>>
): R {
    // --- Hidden Attributes Logic ---
    if (options.hidden && options.hidden.length > 0) {
        return applyHidden(results, options.hidden as string[]);
    }

    return results;
}