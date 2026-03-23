import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOerem } from '../src/index';

describe('Oerem ORM Unit Test', () => {
    // 1. Setup koneksi database (In-Memory)
    const db = createOerem({
        client: 'sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true
    });

    // 2. Definisikan interface untuk testing
    interface IUser {
        id: number;
        username: string;
        email: string;
        role: string;
        created_at?: string;
        updated_at?: string;
        deleted_at?: string | null;
    }

    // 3. Inisialisasi Model
    const User = db.model<IUser>('users', {
        fillable: ['username', 'email'], // 'role' sengaja tidak dimasukkan
        softDelete: true,
        timestamps: true
    });

    beforeAll(async () => {
        // Buat tabel users sebelum test dijalankan
        await db.connection.schema.createTable('users', (table) => {
            table.increments('id').primary();
            table.string('username');
            table.string('email');
            table.string('role').defaultTo('user');
            table.timestamps(true, true);
            table.datetime('deleted_at').nullable();
        });
    });

    afterAll(async () => {
        await db.close();
    });

    it('should create a record with fillable and timestamps', async () => {
        const newUser = await User.create({
            username: 'ghozali',
            email: 'ghozali@example.com',
            role: 'admin' // Ini harusnya terfilter karena tidak ada di fillable
        } as any);

        expect(newUser.id).toBe(1);
        expect(newUser.username).toBe('ghozali');
        expect(newUser.role).toBeUndefined(); // Terfilter oleh applyFillable
        expect(newUser.created_at).toBeDefined();
    });

    it('should find a record by id', async () => {
        const user = await User.find(1);
        expect(user).toBeDefined();
        expect(user?.username).toBe('ghozali');
    });

    it('should update a record and refresh updated_at', async () => {
        const oldUser = await User.find(1);

        // Tunggu sebentar agar timestamp berbeda
        await new Promise(res => setTimeout(res, 1000));

        await User.update(1, { username: 'ghozali_updated' });
        const updatedUser = await User.find(1);

        expect(updatedUser?.username).toBe('ghozali_updated');
        expect(updatedUser?.updated_at).not.toBe(oldUser?.updated_at);
    });

    it('should handle complex chaining with query() and get()', async () => {
        // Tambah user baru untuk testing chaining
        await User.create({ username: 'kafa', email: 'kafa@example.com' });

        const results = await User.with().query(q => q.where('username', 'like', '%kafa%').orderBy('id', 'desc')).get()

        expect(results).toHaveLength(1);
        expect(results[0].username).toBe('kafa');
    });

    it('should perform soft delete and exclude it from all()', async () => {
        // Soft delete user id 2 (kafa)
        await User.softDelete(2);

        const allUsers = await User.all();
        const deletedUser = await db.connection('users').where('id', 2).first();

        // Di hasil ORM harusnya cuma sisa 1 (si ghozali)
        expect(allUsers).toHaveLength(1);
        expect(allUsers[0].username).toBe('ghozali_updated');

        // Tapi di database aslinya record-nya masih ada
        expect(deletedUser).toBeDefined();
        expect(deletedUser.deleted_at).not.toBeNull();
    });

    it('should fail soft delete if option is not enabled', async () => {
        const StrictModel = db.model('other_table', { softDelete: false });

        await expect(StrictModel.softDelete(1)).rejects.toThrow("Soft delete disabled");
    });
});